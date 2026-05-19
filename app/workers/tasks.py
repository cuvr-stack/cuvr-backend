import io
import os
import logging
import tempfile
import numpy as np
from PIL import Image
from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.photo import Photo, ProcessingStatus
from app.models.video import Video, VideoStatus
from app.services.s3 import upload_bytes_to_s3, download_bytes, upload_file_to_s3

logger = logging.getLogger(__name__)


def _update_photo(db, photo_id: str, **kwargs):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if photo:
        for k, v in kwargs.items():
            setattr(photo, k, v)
        db.commit()
    return photo


def _update_video(db, video_id: str, **kwargs):
    video = db.query(Video).filter(Video.id == video_id).first()
    if video:
        for k, v in kwargs.items():
            setattr(video, k, v)
        db.commit()
    return video


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_photo_task(self, photo_id: str):
    """
    Full pipeline: download original → generate thumbnail → run DepthAnything v2
    → build 3D mesh → upload all assets → mark ready.
    """
    db = SessionLocal()
    try:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo:
            logger.error(f"Photo {photo_id} not found")
            return

        _update_photo(db, photo_id, processing_status=ProcessingStatus.processing, processing_progress=5)

        # Step 1: Download original image (local or S3)
        image_bytes = download_bytes(photo.original_url)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        _update_photo(db, photo_id, processing_progress=15)

        # Step 2: Generate thumbnail
        thumb = img.copy()
        thumb.thumbnail((640, 480), Image.LANCZOS)
        thumb_buf = io.BytesIO()
        thumb.save(thumb_buf, format="JPEG", quality=85)
        thumb_key = f"photos/{photo.property_id}/{photo_id}/thumbnail.jpg"
        thumbnail_url = upload_bytes_to_s3(thumb_buf.getvalue(), thumb_key, "image/jpeg")

        _update_photo(db, photo_id, thumbnail_url=thumbnail_url, processing_progress=25)

        # Step 3: Run depth estimation (Depth Pro via Replicate if key available, else local)
        depth_map = _run_depth_estimation(img, image_bytes)
        _update_photo(db, photo_id, processing_progress=60)

        # Step 4: Save depth map PNG
        depth_img = Image.fromarray(depth_map)
        depth_buf = io.BytesIO()
        depth_img.save(depth_buf, format="PNG")
        depth_key = f"photos/{photo.property_id}/{photo_id}/depth_map.png"
        depth_map_url = upload_bytes_to_s3(depth_buf.getvalue(), depth_key, "image/png")

        _update_photo(db, photo_id, depth_map_url=depth_map_url, processing_progress=75)

        # Step 5: Generate GLB mesh from image + depth map
        glb_bytes = _generate_depth_mesh(img, depth_map)
        mesh_key = f"photos/{photo.property_id}/{photo_id}/mesh.glb"
        mesh_url = upload_bytes_to_s3(glb_bytes, mesh_key, "model/gltf-binary")

        _update_photo(
            db, photo_id,
            mesh_url=mesh_url,
            processing_status=ProcessingStatus.ready,
            processing_progress=100,
        )
        logger.info(f"Photo {photo_id} processed successfully")

    except Exception as exc:
        logger.exception(f"Failed to process photo {photo_id}: {exc}")
        _update_photo(
            db, photo_id,
            processing_status=ProcessingStatus.failed,
            error_message=str(exc)[:500],
        )
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=120)
def process_video_task(self, video_id: str):
    """
    Gaussian Splatting pipeline:
    Upload video to Luma AI → poll until complete → store splat URL.
    """
    from app.core.config import settings
    from app.services.luma_ai import create_capture, wait_for_capture

    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.error(f"Video {video_id} not found")
            return

        _update_video(db, video_id, status=VideoStatus.processing, progress=10)

        if not settings.luma_api_key:
            raise RuntimeError("LUMA_API_KEY not configured. Add it to .env to enable Gaussian Splatting.")

        # Submit to Luma AI
        capture = create_capture(video.original_url, title=f"Property Scan {video_id[:8]}")
        capture_id = capture.get("id") or capture.get("generation", {}).get("id")
        _update_video(db, video_id, luma_capture_id=capture_id, progress=20)
        logger.info(f"Luma AI capture submitted: {capture_id}")

        # Poll until done (Luma takes 10-30 min for 3DGS)
        result = wait_for_capture(capture_id, poll_interval=30, max_wait=3600)

        # Extract splat/video URL from result
        assets = result.get("assets", {})
        splat_url = assets.get("video") or assets.get("splat") or result.get("video_url", "")

        _update_video(db, video_id, splat_url=splat_url, status=VideoStatus.ready, progress=100)
        logger.info(f"Video {video_id} Gaussian Splatting complete: {splat_url}")

    except Exception as exc:
        logger.exception(f"Failed to process video {video_id}: {exc}")
        _update_video(db, video_id, status=VideoStatus.failed, error_message=str(exc)[:500])
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def stage_room_task(self, photo_id: str, style: str = "modern"):
    """Virtual Staging: furnish empty room via Replicate (paid) or HuggingFace (free)."""
    from app.core.config import settings

    db = SessionLocal()
    try:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo:
            return

        _update_photo(db, photo_id, processing_status=ProcessingStatus.processing, processing_progress=10)

        # Download original image bytes
        original_bytes = download_bytes(photo.original_url)
        original_img = Image.open(io.BytesIO(original_bytes)).convert("RGB")

        # Engine priority: Replicate (paid, fast) → HuggingFace API (free, rate-limited) → Local (free, always works)
        if settings.replicate_api_token:
            from app.services.replicate_client import stage_room
            staged_url = stage_room(photo.original_url, style=style)
            staged_bytes = (
                download_bytes(staged_url) if staged_url.startswith("http://localhost")
                else __import__("httpx").get(staged_url, timeout=60).content
            )
            staged_img = Image.open(io.BytesIO(staged_bytes)).convert("RGB")
        elif settings.huggingface_token:
            from app.services.hf_client import stage_room_hf
            staged_img = stage_room_hf(original_img, style=style)
            staged_buf = io.BytesIO()
            staged_img.save(staged_buf, format="JPEG", quality=90)
            staged_bytes = staged_buf.getvalue()
        else:
            from app.services.local_ai import stage_room_local
            logger.info(f"Using local Stable Diffusion for staging photo {photo_id}")
            staged_img = stage_room_local(original_img, style=style)
            staged_buf = io.BytesIO()
            staged_img.save(staged_buf, format="JPEG", quality=90)
            staged_bytes = staged_buf.getvalue()

        # Thumbnail
        thumb = staged_img.copy()
        thumb.thumbnail((640, 480), Image.LANCZOS)
        thumb_buf = io.BytesIO()
        thumb.save(thumb_buf, format="JPEG", quality=85)
        thumb_key = f"photos/{photo.property_id}/{photo_id}/staged_thumbnail.jpg"
        staged_thumb_url = upload_bytes_to_s3(thumb_buf.getvalue(), thumb_key, "image/jpeg")

        # Depth map
        depth_map = _run_depth_estimation(staged_img, staged_bytes)
        depth_img = Image.fromarray(depth_map)
        depth_buf = io.BytesIO()
        depth_img.save(depth_buf, format="PNG")
        depth_key = f"photos/{photo.property_id}/{photo_id}/staged_depth.png"
        staged_depth_url = upload_bytes_to_s3(depth_buf.getvalue(), depth_key, "image/png")

        _update_photo(
            db, photo_id,
            thumbnail_url=staged_thumb_url,
            depth_map_url=staged_depth_url,
            processing_status=ProcessingStatus.ready,
            processing_progress=100,
        )
        logger.info(f"Room staged successfully for photo {photo_id}")

    except Exception as exc:
        logger.exception(f"Stage room failed for photo {photo_id}: {exc}")
        _update_photo(db, photo_id, processing_status=ProcessingStatus.failed, error_message=str(exc)[:500])
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def render_sketch_task(self, photo_id: str, style: str = "modern luxury interior", room_type: str = "living room"):
    """Sketch → photorealistic render via Replicate ControlNet (paid) or HuggingFace (free)."""
    from app.core.config import settings

    db = SessionLocal()
    try:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo:
            return

        _update_photo(db, photo_id, processing_status=ProcessingStatus.processing, processing_progress=10)

        # Download original sketch
        original_bytes = download_bytes(photo.original_url)
        original_img = Image.open(io.BytesIO(original_bytes)).convert("RGB")

        # Engine priority: Replicate → HuggingFace API → Local
        if settings.replicate_api_token:
            from app.services.replicate_client import render_sketch
            rendered_url = render_sketch(photo.original_url, style=style, room_type=room_type)
            rendered_bytes = __import__("httpx").get(rendered_url, timeout=60).content
            rendered_img = Image.open(io.BytesIO(rendered_bytes)).convert("RGB")
        elif settings.huggingface_token:
            from app.services.hf_client import render_sketch_hf
            rendered_img = render_sketch_hf(original_img, style=style, room_type=room_type)
            rendered_buf = io.BytesIO()
            rendered_img.save(rendered_buf, format="JPEG", quality=90)
            rendered_bytes = rendered_buf.getvalue()
        else:
            from app.services.local_ai import render_sketch_local
            logger.info(f"Using local Stable Diffusion for sketch render photo {photo_id}")
            rendered_img = render_sketch_local(original_img, style=style, room_type=room_type)
            rendered_buf = io.BytesIO()
            rendered_img.save(rendered_buf, format="JPEG", quality=90)
            rendered_bytes = rendered_buf.getvalue()

        # Store render as new thumbnail
        thumb_buf = io.BytesIO()
        rendered_img.save(thumb_buf, format="JPEG", quality=90)
        thumb_key = f"photos/{photo.property_id}/{photo_id}/rendered_thumbnail.jpg"
        rendered_thumb_url = upload_bytes_to_s3(thumb_buf.getvalue(), thumb_key, "image/jpeg")

        # Depth map from rendered image
        depth_map = _run_depth_estimation(rendered_img, rendered_bytes)
        depth_img = Image.fromarray(depth_map)
        depth_buf = io.BytesIO()
        depth_img.save(depth_buf, format="PNG")
        depth_key = f"photos/{photo.property_id}/{photo_id}/rendered_depth.png"
        rendered_depth_url = upload_bytes_to_s3(depth_buf.getvalue(), depth_key, "image/png")

        _update_photo(
            db, photo_id,
            thumbnail_url=rendered_thumb_url,
            depth_map_url=rendered_depth_url,
            processing_status=ProcessingStatus.ready,
            processing_progress=100,
        )
        logger.info(f"Sketch rendered successfully for photo {photo_id}")

    except Exception as exc:
        logger.exception(f"Render sketch failed for photo {photo_id}: {exc}")
        _update_photo(db, photo_id, processing_status=ProcessingStatus.failed, error_message=str(exc)[:500])
        raise self.retry(exc=exc)
    finally:
        db.close()


def _run_depth_estimation(img: Image.Image, image_bytes: bytes = None) -> np.ndarray:
    from app.core.config import settings

    # Try Apple Depth Pro via Replicate first (best quality)
    if settings.replicate_api_token and image_bytes:
        try:
            from app.services.replicate_client import generate_depth_pro
            from PIL import Image as PILImage
            depth_bytes = generate_depth_pro(image_bytes)
            depth_img = PILImage.open(io.BytesIO(depth_bytes)).convert("L")
            depth_resized = depth_img.resize(img.size, PILImage.LANCZOS)
            return np.array(depth_resized, dtype=np.uint8)
        except Exception as e:
            logger.warning(f"Depth Pro failed ({e}), falling back to local model")

    # Local Depth Anything V2 — use MPS on Apple Silicon, CUDA on Nvidia, else CPU
    try:
        import torch
        from transformers import pipeline as hf_pipeline
        if torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"
        logger.info(f"Running depth estimation on device: {device}")
        # Downscale large images first — MPS/CPU OOM on huge inputs
        work_img = img.copy()
        if max(work_img.size) > 1024:
            work_img.thumbnail((1024, 1024), Image.LANCZOS)
        pipe = hf_pipeline(
            task="depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device,
        )
        result = pipe(work_img)
        depth_array = np.array(result["depth"], dtype=np.float32)
        d_min, d_max = depth_array.min(), depth_array.max()
        if d_max > d_min:
            depth_array = (depth_array - d_min) / (d_max - d_min) * 255
        # Resize back to original image dimensions
        from PIL import Image as PILImage
        depth_pil = PILImage.fromarray(depth_array.astype(np.uint8))
        depth_pil = depth_pil.resize(img.size, PILImage.LANCZOS)
        return np.array(depth_pil, dtype=np.uint8)
    except Exception as e:
        logger.warning(f"DepthAnything failed ({e}), using gradient fallback")
        return _fallback_depth(img)


def _fallback_depth(img: Image.Image) -> np.ndarray:
    import cv2
    gray = np.array(img.convert("L"), dtype=np.float32)
    blur = cv2.GaussianBlur(gray, (21, 21), 0)
    return (255 - blur).astype(np.uint8)


def _generate_depth_mesh(img: Image.Image, depth_map: np.ndarray) -> bytes:
    try:
        import trimesh
        import cv2

        W, H = img.size
        grid_w, grid_h = 128, 128
        depth_resized = cv2.resize(depth_map, (grid_w, grid_h)).astype(np.float32) / 255.0
        depth_scale = 0.3

        xs = np.linspace(0, 1, grid_w)
        ys = np.linspace(0, 1, grid_h)
        xv, yv = np.meshgrid(xs, ys)
        zv = depth_resized * depth_scale
        vertices = np.stack([xv.ravel(), yv.ravel(), zv.ravel()], axis=-1)

        faces = []
        for row in range(grid_h - 1):
            for col in range(grid_w - 1):
                i = row * grid_w + col
                faces.append([i, i + 1, i + grid_w])
                faces.append([i + 1, i + grid_w + 1, i + grid_w])
        faces = np.array(faces)

        uvs = np.stack([xv.ravel(), 1 - yv.ravel()], axis=-1)
        img_resized = img.resize((512, 512), Image.LANCZOS)
        tex_buf = io.BytesIO()
        img_resized.save(tex_buf, format="PNG")
        texture_img = trimesh.visual.texture.TextureVisuals(
            uv=uvs, image=Image.open(io.BytesIO(tex_buf.getvalue()))
        )
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces, visual=texture_img, process=False)
        glb_buf = io.BytesIO()
        mesh.export(glb_buf, file_type="glb")
        return glb_buf.getvalue()

    except Exception as e:
        logger.warning(f"GLB mesh generation failed ({e}), returning empty mesh")
        return b""
