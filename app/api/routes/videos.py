import uuid
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.property import Property
from app.models.video import Video, VideoStatus
from app.api.deps import get_current_user
from app.models.user import User
from app.services.s3 import upload_file_to_s3
from app.workers.tasks import process_video_task

router = APIRouter(tags=["videos"])
logger = logging.getLogger(__name__)

ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}
MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024  # 2GB


def _video_to_dict(v: Video) -> dict:
    return {
        "id": v.id,
        "property_id": v.property_id,
        "filename": v.filename,
        "original_url": v.original_url,
        "splat_url": v.splat_url,
        "thumbnail_url": v.thumbnail_url,
        "status": v.status,
        "progress": v.progress,
        "error_message": v.error_message,
        "file_size_bytes": v.file_size_bytes,
        "duration_seconds": v.duration_seconds,
        "created_at": v.created_at,
    }


@router.post("/properties/{property_id}/videos", status_code=status.HTTP_201_CREATED)
async def upload_video(
    property_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="Only MP4, MOV, AVI, and WebM videos are allowed")

    content = await file.read()

    video_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    s3_key = f"videos/{current_user.id}/{property_id}/{video_id}/original{ext}"
    original_url = await upload_file_to_s3(content, s3_key, file.content_type or "video/mp4")

    video = Video(
        id=video_id,
        property_id=property_id,
        filename=file.filename or f"video{ext}",
        original_url=original_url,
        file_size_bytes=len(content),
        status=VideoStatus.pending,
    )
    db.add(video)
    db.commit()

    try:
        process_video_task.delay(video_id)
    except Exception as e:
        logger.warning(f"Could not enqueue video processing task: {e}")

    return _video_to_dict(video)


@router.get("/properties/{property_id}/videos")
def list_videos(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    videos = db.query(Video).filter(Video.property_id == property_id).order_by(Video.created_at.desc()).all()
    return {"items": [_video_to_dict(v) for v in videos]}


@router.get("/videos/{video_id}")
def get_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = db.query(Video).join(Property).filter(
        Video.id == video_id, Property.user_id == current_user.id
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return _video_to_dict(video)


@router.delete("/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = db.query(Video).join(Property).filter(
        Video.id == video_id, Property.user_id == current_user.id
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    db.delete(video)
    db.commit()
