from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.property import Property
from app.models.photo import Photo, ProcessingStatus
from app.models.tour import Tour
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    property_ids = [
        r[0] for r in db.query(Property.id).filter(Property.user_id == current_user.id).all()
    ]

    property_count = len(property_ids)
    photo_count = db.query(Photo).filter(Photo.property_id.in_(property_ids)).count() if property_ids else 0
    tour_count = db.query(Tour).filter(Tour.property_id.in_(property_ids)).count() if property_ids else 0
    processing_queue = (
        db.query(Photo)
        .filter(Photo.property_id.in_(property_ids), Photo.processing_status == ProcessingStatus.processing)
        .count()
        if property_ids else 0
    )

    # Approximate storage based on file sizes
    size_result = (
        db.query(Photo)
        .filter(Photo.property_id.in_(property_ids))
        .with_entities(Photo.file_size_bytes)
        .all()
        if property_ids else []
    )
    storage_bytes = sum(r[0] or 0 for r in size_result)
    storage_gb = storage_bytes / (1024 ** 3)

    recent_properties = (
        db.query(Property)
        .filter(Property.user_id == current_user.id)
        .order_by(Property.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "property_count": property_count,
        "photo_count": photo_count,
        "tour_count": tour_count,
        "storage_used_gb": round(storage_gb, 3),
        "processing_queue": processing_queue,
        "recent_properties": [
            {
                "id": p.id,
                "name": p.name,
                "address": p.address,
                "photo_count": db.query(Photo).filter(Photo.property_id == p.id).count(),
            }
            for p in recent_properties
        ],
    }
