"""
floor_plan.py – Floor Plan Upload & 3D Walkthrough Routes
──────────────────────────────────────────────────────────

POST /properties/{property_id}/floor-plans
    Upload a 2D floor plan image → starts Celery pipeline

GET  /properties/{property_id}/floor-plans
    List all floor plans for a property

GET  /floor-plans/{floor_plan_id}
    Get status + result for a specific floor plan

DELETE /floor-plans/{floor_plan_id}
    Delete a floor plan and its assets
"""

import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.property import Property
from app.models.floor_plan import FloorPlan, FloorPlanStatus
from app.api.deps import get_current_user
from app.models.user import User
from app.services.s3 import upload_file_to_s3
from app.workers.floor_plan_tasks import process_floor_plan_task

router = APIRouter(tags=["floor-plans"])
logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/tiff", "application/pdf"
}
MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50 MB


# ── Serialiser ────────────────────────────────────────────────────────────────

def _fp_to_dict(fp: FloorPlan) -> dict:
    return {
        "id":             fp.id,
        "property_id":    fp.property_id,
        "filename":       fp.filename,
        "original_url":   fp.original_url,
        "status":         fp.status,
        "progress":       fp.progress,
        "error_message":  fp.error_message,
        "glb_url":        fp.glb_url,
        "nav_nodes":      fp.nav_nodes,
        "room_textures":  fp.room_textures,
        "parsed_data":    fp.parsed_data,
        "created_at":     fp.created_at.isoformat() if fp.created_at else None,
        "updated_at":     fp.updated_at.isoformat() if fp.updated_at else None,
    }


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/properties/{property_id}/floor-plans", status_code=status.HTTP_201_CREATED)
async def upload_floor_plan(
    property_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a 2D architectural floor plan image.

    Accepted formats: JPEG, PNG, WebP, TIFF
    Max size: 50 MB

    The pipeline runs asynchronously:
      1. GPT-4 Vision  → parse rooms, dimensions, door connections
      2. trimesh       → extrude 3D geometry → GLB
      3. FLUX Dev      → generate photorealistic room textures
      4. Unity-ready   → nav nodes + texture URLs returned

    Poll GET /floor-plans/{id} for status and results.
    """
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES and not file.filename.lower().endswith(
        (".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif")
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Accepted: JPEG, PNG, WebP, TIFF"
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")

    fp_id = str(uuid.uuid4())
    ext   = os.path.splitext(file.filename or "plan.jpg")[1] or ".jpg"
    s3_key = f"floor-plans/{current_user.id}/{property_id}/{fp_id}/original{ext}"

    original_url = await upload_file_to_s3(
        content, s3_key, content_type or "image/jpeg")

    floor_plan = FloorPlan(
        id          = fp_id,
        property_id = property_id,
        user_id     = current_user.id,
        filename    = file.filename,
        original_url= original_url,
        status      = FloorPlanStatus.PENDING,
        progress    = 0,
    )
    db.add(floor_plan)
    db.commit()
    db.refresh(floor_plan)

    # Kick off async pipeline
    try:
        process_floor_plan_task.delay(fp_id)
    except Exception as e:
        logger.warning(f"Could not enqueue floor plan task: {e}")

    logger.info(f"[FloorPlan] Uploaded {fp_id} for property {property_id}")
    return _fp_to_dict(floor_plan)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/properties/{property_id}/floor-plans")
def list_floor_plans(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    plans = db.query(FloorPlan).filter(
        FloorPlan.property_id == property_id
    ).order_by(FloorPlan.created_at.desc()).all()

    return [_fp_to_dict(fp) for fp in plans]


# ── Get one ────────────────────────────────────────────────────────────────────

@router.get("/floor-plans/{floor_plan_id}")
def get_floor_plan(
    floor_plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fp = db.query(FloorPlan).filter(
        FloorPlan.id == floor_plan_id,
        FloorPlan.user_id == current_user.id,
    ).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    return _fp_to_dict(fp)


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/floor-plans/{floor_plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor_plan(
    floor_plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fp = db.query(FloorPlan).filter(
        FloorPlan.id == floor_plan_id,
        FloorPlan.user_id == current_user.id,
    ).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    db.delete(fp)
    db.commit()
