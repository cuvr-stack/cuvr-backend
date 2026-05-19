import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.photo import Photo, ProcessingStatus
from app.models.property import Property
from app.api.deps import get_current_user
from app.models.user import User
from app.workers.tasks import stage_room_task, render_sketch_task

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

INTERIOR_STYLES = ["modern", "classic", "minimalist", "luxury", "industrial", "scandinavian", "arabic"]
ROOM_TYPES = [
    "exterior building", "living room", "bedroom", "kitchen",
    "bathroom", "office", "dining room", "hallway",
]


class StageRoomRequest(BaseModel):
    style: str = "modern"


class RenderSketchRequest(BaseModel):
    style: str = "modern luxury interior"
    room_type: str = "living room"


@router.post("/photos/{photo_id}/stage", status_code=status.HTTP_202_ACCEPTED)
def stage_room(
    photo_id: str,
    req: StageRoomRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Virtual Staging: furnish an empty room photo using AI."""
    photo = db.query(Photo).join(Property).filter(
        Photo.id == photo_id, Property.user_id == current_user.id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.processing_status == ProcessingStatus.processing:
        raise HTTPException(status_code=400, detail="Photo is already being processed")
    if req.style not in INTERIOR_STYLES:
        raise HTTPException(status_code=400, detail=f"Style must be one of: {', '.join(INTERIOR_STYLES)}")

    photo.processing_status = ProcessingStatus.pending
    photo.processing_progress = 0
    db.commit()

    try:
        stage_room_task.delay(photo_id, req.style)
    except Exception as e:
        logger.warning(f"Could not enqueue staging task: {e}")

    return {"detail": "Virtual staging queued", "style": req.style}


@router.post("/photos/{photo_id}/render-sketch", status_code=status.HTTP_202_ACCEPTED)
def render_sketch(
    photo_id: str,
    req: RenderSketchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sketch/floor plan → photorealistic render using AI, then depth pipeline."""
    photo = db.query(Photo).join(Property).filter(
        Photo.id == photo_id, Property.user_id == current_user.id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.processing_status == ProcessingStatus.processing:
        raise HTTPException(status_code=400, detail="Photo is already being processed")

    photo.processing_status = ProcessingStatus.pending
    photo.processing_progress = 0
    db.commit()

    try:
        render_sketch_task.delay(photo_id, req.style, req.room_type)
    except Exception as e:
        logger.warning(f"Could not enqueue sketch render task: {e}")

    return {"detail": "Sketch rendering queued", "style": req.style, "room_type": req.room_type}


@router.get("/styles")
def get_styles():
    return {"interior_styles": INTERIOR_STYLES, "room_types": ROOM_TYPES}
