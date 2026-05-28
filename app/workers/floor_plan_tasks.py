"""
floor_plan_tasks.py – Celery worker task for floor plan processing
──────────────────────────────────────────────────────────────────

Full pipeline:
  5%  → Download floor plan image
  15% → GPT-4 Vision: parse rooms, walls, dimensions
  45% → trimesh: build 3D geometry → export GLB
  50% → Upload GLB to S3
  55-90% → FLUX Schnell: generate photorealistic room textures
  95% → Upload textures, wire nav nodes
  100%→ Mark ready
"""

import io
import logging
from app.workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.floor_plan import FloorPlan, FloorPlanStatus
from app.services.s3 import download_bytes, upload_bytes_to_s3

logger = logging.getLogger(__name__)


def _update(db, fp_id: str, **kwargs):
    fp = db.query(FloorPlan).filter(FloorPlan.id == fp_id).first()
    if fp:
        for k, v in kwargs.items():
            setattr(fp, k, v)
        db.commit()
    return fp


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def process_floor_plan_task(self, floor_plan_id: str):
    """End-to-end floor plan → 3D walkthrough pipeline."""

    db = SessionLocal()
    try:
        fp = db.query(FloorPlan).filter(FloorPlan.id == floor_plan_id).first()
        if not fp:
            logger.error(f"FloorPlan {floor_plan_id} not found")
            return

        _update(db, floor_plan_id,
                status=FloorPlanStatus.PARSING, progress=5)

        # ── Step 1: Download image ────────────────────────────────────────────
        logger.info(f"[FPTask] Downloading image: {fp.original_url}")
        image_bytes = download_bytes(fp.original_url)
        _update(db, floor_plan_id, progress=10)

        # ── Step 2: GPT-4 Vision parsing ──────────────────────────────────────
        logger.info(f"[FPTask] Parsing floor plan with GPT-4 Vision...")
        from app.services.floor_plan_ai import parse_floor_plan

        openai_key = getattr(settings, "openai_api_key", "")
        if not openai_key:
            raise RuntimeError(
                "OPENAI_API_KEY not configured. Add it to your .env file.")

        parsed = parse_floor_plan(image_bytes, openai_key)
        room_count = len(parsed.get("rooms", []))
        logger.info(f"[FPTask] Parsed {room_count} rooms")

        _update(db, floor_plan_id,
                status=FloorPlanStatus.BUILDING,
                parsed_data=parsed,
                progress=35)

        # ── Step 3: 3D Geometry → GLB ─────────────────────────────────────────
        logger.info(f"[FPTask] Building 3D geometry...")
        from app.services.geometry_builder import build_glb

        glb_bytes, nav_nodes = build_glb(parsed)
        _update(db, floor_plan_id, progress=45)

        # Upload GLB
        glb_key = (f"floor-plans/{fp.user_id}/{fp.property_id}"
                   f"/{floor_plan_id}/model.glb")
        glb_url = upload_bytes_to_s3(glb_bytes, glb_key, "model/gltf-binary")
        logger.info(f"[FPTask] GLB uploaded: {glb_url}")

        _update(db, floor_plan_id,
                glb_url=glb_url, nav_nodes=nav_nodes, progress=50)

        # ── Step 4: FLUX texture generation ──────────────────────────────────
        rooms = parsed.get("rooms", [])
        room_textures: dict[str, str] = {}

        if settings.replicate_api_token and rooms:
            _update(db, floor_plan_id,
                    status=FloorPlanStatus.TEXTURING, progress=55)
            logger.info(f"[FPTask] Generating {len(rooms)} room textures via FLUX...")

            from app.services.floor_plan_ai import generate_room_textures_batch

            def _progress_cb(pct: int):
                _update(db, floor_plan_id, progress=pct)

            texture_bytes = generate_room_textures_batch(
                rooms,
                settings.replicate_api_token,
                progress_cb=_progress_cb,
            )

            # Upload each texture
            for room_id, jpg_bytes in texture_bytes.items():
                tex_key = (f"floor-plans/{fp.user_id}/{fp.property_id}"
                           f"/{floor_plan_id}/textures/{room_id}.jpg")
                tex_url = upload_bytes_to_s3(jpg_bytes, tex_key, "image/jpeg")
                room_textures[room_id] = tex_url

            # Wire texture URLs into nav nodes
            tex_by_room = {
                node["roomId"]: room_textures.get(node["roomId"], "")
                for node in nav_nodes
            }
            for node in nav_nodes:
                node["textureUrl"]  = tex_by_room.get(node["roomId"], "")
                node["panoramaUrl"] = tex_by_room.get(node["roomId"], "")

            logger.info(f"[FPTask] {len(room_textures)} textures uploaded")
        else:
            logger.info("[FPTask] Skipping texture generation "
                        "(no REPLICATE_API_TOKEN or no rooms)")

        # ── Step 5: Mark ready ────────────────────────────────────────────────
        _update(db, floor_plan_id,
                status=FloorPlanStatus.READY,
                progress=100,
                nav_nodes=nav_nodes,
                room_textures=room_textures,
                error_message=None)

        logger.info(f"[FPTask] ✅ Floor plan {floor_plan_id} ready! "
                    f"{room_count} rooms, {len(room_textures)} textures")

    except Exception as exc:
        logger.exception(f"[FPTask] ❌ Failed: {exc}")
        try:
            self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            _update(db, floor_plan_id,
                    status=FloorPlanStatus.FAILED,
                    error_message=str(exc))
    finally:
        db.close()
