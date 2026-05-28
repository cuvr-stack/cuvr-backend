"""
floor_plan_tasks.py – Celery worker task for floor plan processing
──────────────────────────────────────────────────────────────────

Full pipeline:
  5%  → Download floor plan image
  15% → Claude Vision: parse rooms, walls, dimensions
  45% → trimesh: build 3D geometry → export GLB
  50% → Upload GLB to S3
  55-90% → FLUX Schnell: generate photorealistic room textures
  95% → Upload textures, wire nav nodes
  100%→ Mark ready

Resume logic: if parsed_data/glb_url already saved, skip those steps on retry.
Rate-limit (429) retries with a longer delay and higher max_retries.
"""

import logging
import time
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


@celery_app.task(bind=True, max_retries=10, default_retry_delay=60)
def process_floor_plan_task(self, floor_plan_id: str):
    """End-to-end floor plan → 3D walkthrough pipeline.
    Resumes from the last completed step on retry to avoid re-running Claude.
    """

    db = SessionLocal()
    try:
        fp = db.query(FloorPlan).filter(FloorPlan.id == floor_plan_id).first()
        if not fp:
            logger.error(f"FloorPlan {floor_plan_id} not found")
            return

        # ── Step 1: Download image ────────────────────────────────────────────
        _update(db, floor_plan_id, status=FloorPlanStatus.PARSING, progress=5)
        logger.info(f"[FPTask] Downloading image: {fp.original_url}")
        image_bytes = download_bytes(fp.original_url)
        _update(db, floor_plan_id, progress=10)

        # ── Step 2: Claude Vision parsing — SKIP if already done ─────────────
        if fp.parsed_data:
            # Resume: parsed_data was saved from a previous attempt
            parsed = fp.parsed_data
            room_count = len(parsed.get("rooms", []))
            logger.info(f"[FPTask] Reusing cached parse: {room_count} rooms")
        else:
            logger.info(f"[FPTask] Parsing floor plan with Claude Vision (Replicate)...")
            from app.services.floor_plan_ai import parse_floor_plan

            if not settings.replicate_api_token:
                raise RuntimeError(
                    "REPLICATE_API_TOKEN not configured. Add it to your .env file.")

            parsed = parse_floor_plan(image_bytes, settings.replicate_api_token)
            room_count = len(parsed.get("rooms", []))
            logger.info(f"[FPTask] Parsed {room_count} rooms")

        _update(db, floor_plan_id,
                status=FloorPlanStatus.BUILDING,
                parsed_data=parsed,
                progress=35)

        # ── Step 3: 3D Geometry → GLB — SKIP if already uploaded ─────────────
        # Re-fetch to get latest db state (glb_url / nav_nodes may be set)
        db.expire(fp)
        fp = db.query(FloorPlan).filter(FloorPlan.id == floor_plan_id).first()

        if fp.glb_url and fp.nav_nodes:
            glb_url  = fp.glb_url
            nav_nodes = fp.nav_nodes
            logger.info(f"[FPTask] Reusing cached GLB: {glb_url}")
        else:
            logger.info(f"[FPTask] Building 3D geometry...")
            from app.services.geometry_builder import build_glb

            glb_bytes, nav_nodes = build_glb(parsed)
            _update(db, floor_plan_id, progress=45)

            glb_key = (f"floor-plans/{fp.user_id}/{fp.property_id}"
                       f"/{floor_plan_id}/model.glb")
            glb_url = upload_bytes_to_s3(glb_bytes, glb_key, "model/gltf-binary")
            logger.info(f"[FPTask] GLB uploaded: {glb_url}")

        _update(db, floor_plan_id,
                glb_url=glb_url, nav_nodes=nav_nodes, progress=50)

        # ── Step 4: FLUX texture generation ──────────────────────────────────
        rooms = parsed.get("rooms", [])

        # Re-fetch again to get any previously saved room_textures
        db.expire(fp)
        fp = db.query(FloorPlan).filter(FloorPlan.id == floor_plan_id).first()
        room_textures: dict[str, str] = fp.room_textures or {}

        if settings.replicate_api_token and rooms:
            # Find rooms that still need textures
            rooms_needing_textures = [r for r in rooms if r["id"] not in room_textures]

            if not rooms_needing_textures:
                logger.info("[FPTask] All textures already generated, skipping FLUX")
            else:
                done = len(rooms) - len(rooms_needing_textures)
                logger.info(f"[FPTask] Generating textures for "
                            f"{len(rooms_needing_textures)}/{len(rooms)} rooms "
                            f"({done} already done)...")

                _update(db, floor_plan_id,
                        status=FloorPlanStatus.TEXTURING,
                        progress=55 + int(30 * done / len(rooms)))

                from app.services.floor_plan_ai import generate_room_texture, _room_type_key

                # Deduplicate by room type (same as batch helper)
                type_cache: dict[str, bytes] = {}

                for i, room in enumerate(rooms_needing_textures):
                    rtype = room.get("type", "default")
                    key   = _room_type_key(rtype)

                    # Retry loop for individual texture (handles 429)
                    for attempt in range(5):
                        try:
                            if key not in type_cache:
                                logger.info(f"[FPTask] FLUX texture: {key} ...")
                                type_cache[key] = generate_room_texture(
                                    rtype, settings.replicate_api_token)
                            break  # success
                        except Exception as tex_exc:
                            err = str(tex_exc)
                            if "429" in err or "throttled" in err.lower() or "rate" in err.lower():
                                wait = 30 * (attempt + 1)
                                logger.warning(
                                    f"[FPTask] Rate limited on texture '{key}', "
                                    f"waiting {wait}s (attempt {attempt+1}/5)...")
                                time.sleep(wait)
                            else:
                                raise  # non-rate-limit error — propagate

                    jpg_bytes = type_cache[key]
                    tex_key = (f"floor-plans/{fp.user_id}/{fp.property_id}"
                               f"/{floor_plan_id}/textures/{room['id']}.jpg")
                    tex_url = upload_bytes_to_s3(jpg_bytes, tex_key, "image/jpeg")
                    room_textures[room["id"]] = tex_url

                    # Save progress incrementally so a crash doesn't lose work
                    pct = int(55 + 35 * (done + i + 1) / len(rooms))
                    _update(db, floor_plan_id,
                            room_textures=room_textures,
                            progress=pct)

            logger.info(f"[FPTask] {len(room_textures)} textures total")
        else:
            logger.info("[FPTask] Skipping texture generation "
                        "(no REPLICATE_API_TOKEN or no rooms)")

        # Wire texture URLs into nav nodes
        for node in nav_nodes:
            rid = node.get("roomId", "")
            node["textureUrl"]  = room_textures.get(rid, "")
            node["panoramaUrl"] = room_textures.get(rid, "")

        # ── Step 5: Mark ready ────────────────────────────────────────────────
        _update(db, floor_plan_id,
                status=FloorPlanStatus.READY,
                progress=100,
                nav_nodes=nav_nodes,
                room_textures=room_textures,
                error_message=None)

        logger.info(f"[FPTask] ✅ Floor plan {floor_plan_id} ready! "
                    f"{len(parsed.get('rooms',[]))} rooms, "
                    f"{len(room_textures)} textures")

    except Exception as exc:
        err_str = str(exc)
        logger.exception(f"[FPTask] ❌ Failed: {exc}")
        # Use longer delay for rate-limit errors
        retry_delay = 60 if ("429" in err_str or "throttled" in err_str.lower()) else 30
        try:
            self.retry(exc=exc, countdown=retry_delay)
        except self.MaxRetriesExceededError:
            _update(db, floor_plan_id,
                    status=FloorPlanStatus.FAILED,
                    error_message=err_str)
    finally:
        db.close()
