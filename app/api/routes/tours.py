import secrets
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.tour import Tour, TourScene
from app.models.photo import Photo, ProcessingStatus
from app.models.property import Property
from app.api.deps import get_current_user
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/tours", tags=["tours"])


class CreateTourRequest(BaseModel):
    property_id: str
    name: str
    description: str | None = None
    photo_ids: list[str]


class UpdateTourRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    is_public: bool | None = None


def _generate_share_code(db) -> str:
    """Generate a unique 6-digit numeric code."""
    for _ in range(20):
        code = f"{random.randint(0, 999999):06d}"
        if not db.query(Tour).filter(Tour.share_code == code).first():
            return code
    raise RuntimeError("Could not generate unique share code")


def _tour_to_dict(tour: Tour, base_url: str = ""):
    return {
        "id": tour.id,
        "property_id": tour.property_id,
        "name": tour.name,
        "description": tour.description,
        "is_public": tour.is_public,
        "share_token": tour.share_token,
        "share_code": tour.share_code,
        "share_url": f"{base_url}/vr/tour/{tour.share_token}" if tour.share_token else None,
        "view_count": tour.view_count,
        "scenes": [
            {
                "id": s.id,
                "photo_id": s.photo_id,
                "order": s.order,
                "label": s.label,
                "hotspots": s.hotspots,
                "photo": {
                    "id": s.photo.id,
                    "thumbnail_url": s.photo.thumbnail_url,
                    "original_url": s.photo.original_url,
                    "depth_map_url": s.photo.depth_map_url,
                    "mesh_url": s.photo.mesh_url,
                    "room_label": s.photo.room_label,
                } if s.photo else None,
            }
            for s in tour.scenes
        ],
        "created_at": tour.created_at,
        "updated_at": tour.updated_at,
    }


@router.get("")
def list_tours(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    size: int = 20,
):
    query = (
        db.query(Tour)
        .join(Property)
        .filter(Property.user_id == current_user.id)
        .order_by(Tour.created_at.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return {"items": [_tour_to_dict(t, settings.frontend_url) for t in items], "total": total, "page": page, "size": size}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tour(
    req: CreateTourRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == req.property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    photos = db.query(Photo).filter(
        Photo.id.in_(req.photo_ids),
        Photo.property_id == req.property_id,
        Photo.processing_status == ProcessingStatus.ready,
    ).all()
    if len(photos) != len(req.photo_ids):
        raise HTTPException(status_code=400, detail="Some photos are not ready or don't belong to this property")

    tour = Tour(property_id=req.property_id, name=req.name, description=req.description)
    db.add(tour)
    db.flush()

    photo_map = {p.id: p for p in photos}
    for order, photo_id in enumerate(req.photo_ids):
        photo = photo_map[photo_id]
        scene = TourScene(
            tour_id=tour.id,
            photo_id=photo_id,
            order=order,
            label=photo.room_label or f"Scene {order + 1}",
            hotspots=[],
        )
        db.add(scene)

    db.commit()
    db.refresh(tour)
    return _tour_to_dict(tour, settings.frontend_url)


@router.get("/{tour_id}")
def get_tour(
    tour_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tour = db.query(Tour).join(Property).filter(
        Tour.id == tour_id, Property.user_id == current_user.id
    ).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    return _tour_to_dict(tour, settings.frontend_url)


@router.get("/{tour_id}/manifest")
def get_tour_manifest(tour_id: str, token: str, db: Session = Depends(get_db)):
    """Unity app fetches this to load scene assets. Validated by share token."""
    tour = db.query(Tour).filter(Tour.id == tour_id, Tour.share_token == token).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found or token invalid")
    tour.view_count += 1
    db.commit()
    return _tour_to_dict(tour)


@router.post("/{tour_id}/token")
def generate_share_token(
    tour_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tour = db.query(Tour).join(Property).filter(
        Tour.id == tour_id, Property.user_id == current_user.id
    ).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    tour.share_token = secrets.token_urlsafe(32)
    if not tour.share_code:
        tour.share_code = _generate_share_code(db)
    tour.is_public = True
    db.commit()
    return {
        "share_token": tour.share_token,
        "share_code": tour.share_code,
        "share_url": f"{settings.frontend_url}/vr/tour/{tour.share_token}",
    }


@router.get("/view/{token}")
def get_tour_by_token(token: str, db: Session = Depends(get_db)):
    """Public endpoint — fetch tour manifest by share token alone."""
    tour = db.query(Tour).filter(Tour.share_token == token).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    tour.view_count += 1
    db.commit()
    return _tour_to_dict(tour, settings.frontend_url)


@router.get("/code/{code}")
def get_tour_by_code(code: str, db: Session = Depends(get_db)):
    """Public endpoint — Meta Quest app fetches tour by 6-digit code."""
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(status_code=400, detail="Code must be exactly 6 digits")
    tour = db.query(Tour).filter(Tour.share_code == code, Tour.is_public == True).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Invalid code — tour not found")
    tour.view_count += 1
    db.commit()
    return _tour_to_dict(tour, settings.frontend_url)


@router.delete("/{tour_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tour(
    tour_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tour = db.query(Tour).join(Property).filter(
        Tour.id == tour_id, Property.user_id == current_user.id
    ).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    db.delete(tour)
    db.commit()
