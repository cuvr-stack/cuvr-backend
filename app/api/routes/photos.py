import uuid
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.property import Property
from app.models.photo import Photo, ProcessingStatus
from app.api.deps import get_current_user
from app.models.user import User
from app.services.s3 import upload_file_to_s3, generate_presigned_url
from app.workers.tasks import process_photo_task

logger = logging.getLogger(__name__)

router = APIRouter(tags=["photos"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

PLAN_PHOTO_LIMITS = {"free": 5, "starter": 20, "professional": 100, "enterprise": -1}


def _get_property_or_404(property_id: str, user_id: str, db: Session) -> Property:
    prop = db.query(Property).filter(Property.id == property_id, Property.user_id == user_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.post("/properties/{property_id}/photos", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    property_id: str,
    file: UploadFile = File(...),
    room_label: str = Form(default=None),
    skip_process: bool = Form(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = _get_property_or_404(property_id, current_user.id, db)

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    limit = PLAN_PHOTO_LIMITS.get(current_user.subscription_plan, 5)
    if limit != -1:
        count = db.query(Photo).filter(Photo.property_id == property_id).count()
        if count >= limit:
            raise HTTPException(status_code=403, detail=f"Photo limit ({limit}) reached for your plan")

    photo_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    s3_key = f"photos/{current_user.id}/{property_id}/{photo_id}/original{ext}"

    original_url = await upload_file_to_s3(content, s3_key, file.content_type)

    photo = Photo(
        id=photo_id,
        property_id=property_id,
        filename=file.filename or f"photo{ext}",
        room_label=room_label or (file.filename or "").rsplit(".", 1)[0],
        original_url=original_url,
        file_size_bytes=len(content),
        processing_status=ProcessingStatus.pending,
    )
    db.add(photo)
    db.commit()

    if not skip_process:
        try:
            process_photo_task.delay(photo_id)
        except Exception as e:
            # Redis / Celery broker not available — photo is saved, will need manual retry
            logger.warning(f"Could not enqueue processing task for photo {photo_id}: {e}")

    return {
        "id": photo.id,
        "property_id": photo.property_id,
        "filename": photo.filename,
        "room_label": photo.room_label,
        "original_url": photo.original_url,
        "processing_status": photo.processing_status,
        "processing_progress": 0,
        "created_at": photo.created_at,
    }


@router.get("/properties/{property_id}/photos")
def list_photos(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    size: int = 50,
):
    _get_property_or_404(property_id, current_user.id, db)
    query = db.query(Photo).filter(Photo.property_id == property_id).order_by(Photo.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return {
        "items": [_photo_to_dict(p) for p in items],
        "total": total, "page": page, "size": size,
    }


@router.get("/photos/{photo_id}/status")
def get_photo_status(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    photo = db.query(Photo).join(Property).filter(
        Photo.id == photo_id, Property.user_id == current_user.id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return _photo_to_dict(photo)


@router.post("/photos/{photo_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    photo = db.query(Photo).join(Property).filter(
        Photo.id == photo_id, Property.user_id == current_user.id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Allow retry from ANY state, including stuck "processing"
    photo.processing_status = ProcessingStatus.pending
    photo.processing_progress = 0
    photo.error_message = None
    db.commit()
    process_photo_task.delay(photo_id)
    return {"detail": "Processing queued"}


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    photo = db.query(Photo).join(Property).filter(
        Photo.id == photo_id, Property.user_id == current_user.id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()


def _photo_to_dict(p: Photo):
    return {
        "id": p.id,
        "property_id": p.property_id,
        "filename": p.filename,
        "room_label": p.room_label,
        "original_url": p.original_url,
        "thumbnail_url": p.thumbnail_url,
        "depth_map_url": p.depth_map_url,
        "mesh_url": p.mesh_url,
        "processing_status": p.processing_status,
        "processing_progress": p.processing_progress,
        "error_message": p.error_message,
        "created_at": p.created_at,
    }
