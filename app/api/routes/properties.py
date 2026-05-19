from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.models.property import Property, PropertyType, PropertyStatus
from app.models.photo import Photo
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/properties", tags=["properties"])

PLAN_PROPERTY_LIMITS = {"free": 1, "starter": 5, "professional": 25, "enterprise": -1}


class CreatePropertyRequest(BaseModel):
    name: str
    address: str
    description: str | None = None
    property_type: PropertyType = PropertyType.apartment


class UpdatePropertyRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    description: str | None = None
    status: PropertyStatus | None = None


def property_to_dict(p: Property, photo_count: int = 0, tour_count: int = 0):
    return {
        "id": p.id,
        "user_id": p.user_id,
        "name": p.name,
        "address": p.address,
        "description": p.description,
        "property_type": p.property_type,
        "status": p.status,
        "photo_count": photo_count,
        "tour_count": tour_count,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


@router.get("")
def list_properties(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    size: int = 20,
):
    query = db.query(Property).filter(
        Property.user_id == current_user.id,
        Property.status == PropertyStatus.active,
    )
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    result = []
    for p in items:
        photo_count = db.query(Photo).filter(Photo.property_id == p.id).count()
        tour_count = len(p.tours)
        result.append(property_to_dict(p, photo_count, tour_count))
    return {"items": result, "total": total, "page": page, "size": size, "pages": -(-total // size)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_property(
    req: CreatePropertyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limit = PLAN_PROPERTY_LIMITS.get(current_user.subscription_plan, 1)
    if limit != -1:
        count = db.query(Property).filter(Property.user_id == current_user.id).count()
        if count >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Property limit reached for your plan ({limit}). Please upgrade.",
            )
    prop = Property(user_id=current_user.id, **req.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return property_to_dict(prop)


@router.get("/{property_id}")
def get_property(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    photo_count = db.query(Photo).filter(Photo.property_id == prop.id).count()
    return property_to_dict(prop, photo_count, len(prop.tours))


@router.patch("/{property_id}")
def update_property(
    property_id: str,
    req: UpdatePropertyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    db.commit()
    return property_to_dict(prop)


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(
        Property.id == property_id, Property.user_id == current_user.id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    db.delete(prop)
    db.commit()
