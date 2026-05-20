import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.photo import Photo, ProcessingStatus
from app.models.photo_variation import PhotoVariation, VariationStatus
from app.models.property import Property
from app.api.deps import get_current_user
from app.models.user import User
from app.workers.tasks import stage_room_task, render_sketch_task, generate_3d_task, generate_scene_variation_task

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


class Generate3DRequest(BaseModel):
    photo_ids: list[str]          # ordered: [front, left, right, back, ...]
    style: str = "modern minimalist"
    room_type: str = "exterior building"


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


@router.post("/properties/{property_id}/generate-3d", status_code=status.HTTP_202_ACCEPTED)
def generate_3d(
    property_id: str,
    req: Generate3DRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Multi-view images → 3D mesh.
    Requires 2–6 photos from different angles (front, sides, back).
    The generated GLB is stored and linked to the first photo.
    """
    if len(req.photo_ids) < 1:
        raise HTTPException(status_code=400, detail="At least 1 image required")
    if len(req.photo_ids) > 6:
        raise HTTPException(status_code=400, detail="Maximum 6 images")

    # Verify all photos belong to this user's property
    photos = (
        db.query(Photo)
        .join(Property)
        .filter(
            Photo.id.in_(req.photo_ids),
            Property.id == property_id,
            Property.user_id == current_user.id,
        )
        .all()
    )
    if len(photos) != len(req.photo_ids):
        raise HTTPException(status_code=404, detail="One or more photos not found")

    # Mark all as pending
    for photo in photos:
        photo.processing_status = ProcessingStatus.pending
        photo.processing_progress = 0
    db.commit()

    try:
        generate_3d_task.delay(req.photo_ids, req.style, req.room_type)
    except Exception as e:
        logger.warning(f"Could not enqueue 3D generation task: {e}")

    return {"detail": "3D generation queued", "photo_ids": req.photo_ids}


@router.get("/styles")
def get_styles():
    return {"interior_styles": INTERIOR_STYLES, "room_types": ROOM_TYPES}


# ── Scene Variation ─────────────────────────────────────────────────────────

VALID_ELEMENTS = {"walls", "landscaping", "windows", "roof", "driveway"}
VALID_STYLES   = {"Modern", "Contemporary", "Mediterranean", "Minimalist", "Tropical", "Industrial"}
VALID_MODELS   = {"standard", "quality", "ultra"}


class SceneVariationRequest(BaseModel):
    prompt:          str = ""
    elements:        list[str] = []
    style:           str = "Modern"
    color:           str = ""
    ai_model:        str = "quality"   # standard | quality | ultra
    image_strength:  int = 65          # 0–100: how much of the original is preserved
    style_strength:  int = 75          # 0–100: how faithfully the prompt is followed
    ultra_realism:   bool = True


@router.post("/photos/{photo_id}/scene-variation", status_code=status.HTTP_202_ACCEPTED)
def create_scene_variation(
    photo_id: str,
    req: SceneVariationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Queue a scene variation — AI re-renders chosen elements in a new style/colour."""
    photo = (
        db.query(Photo).join(Property)
        .filter(Photo.id == photo_id, Property.user_id == current_user.id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    if not photo.thumbnail_url and not photo.original_url:
        raise HTTPException(status_code=400, detail="Photo has no image to vary")

    if not req.prompt.strip() and not req.elements:
        raise HTTPException(status_code=400, detail="Provide a prompt or at least one element")

    elements = [e for e in req.elements if e in VALID_ELEMENTS]
    style    = req.style    if req.style    in VALID_STYLES  else "Modern"
    ai_model = req.ai_model if req.ai_model in VALID_MODELS  else "quality"

    variation = PhotoVariation(
        photo_id=photo_id,
        elements=json.dumps(elements),
        style=style,
        color=req.color,
        prompt=req.prompt.strip(),
        ai_model=ai_model,
        image_strength=max(0, min(100, req.image_strength)),
        style_strength=max(0, min(100, req.style_strength)),
        ultra_realism=req.ultra_realism,
        status=VariationStatus.pending,
    )
    db.add(variation)
    db.commit()
    db.refresh(variation)

    try:
        generate_scene_variation_task.delay(variation.id)
    except Exception as e:
        logger.warning(f"Could not enqueue scene variation task: {e}")

    return {
        "variation_id": variation.id,
        "status":   variation.status,
        "elements": elements,
        "style":    style,
        "ai_model": ai_model,
    }


@router.get("/variations/{variation_id}")
def get_variation(
    variation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll variation status + URL."""
    variation = (
        db.query(PhotoVariation)
        .join(Photo).join(Property)
        .filter(
            PhotoVariation.id == variation_id,
            Property.user_id == current_user.id,
        )
        .first()
    )
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    elements = json.loads(variation.elements) if variation.elements else []
    return {
        "id":            variation.id,
        "photo_id":      variation.photo_id,
        "status":        variation.status,
        "variation_url": variation.variation_url,
        "elements":      elements,
        "style":         variation.style,
        "color":         variation.color,
        "prompt":        variation.prompt,
        "ai_model":      getattr(variation, "ai_model", "quality"),
        "error_message": variation.error_message,
    }
