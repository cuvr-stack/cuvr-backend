"""
Entitlement routes — per-project feature gating.

GET  /api/properties/{id}/entitlement        → fetch entitlement for a project (any auth'd user who owns the property)
POST /api/properties/{id}/entitlement        → create or update entitlement (owner only for now; restrict to admin in prod)
DELETE /api/properties/{id}/entitlement      → remove entitlement
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.entitlement import Entitlement
from app.models.property import Property
from app.models.user import User

router = APIRouter(prefix="/api/properties", tags=["entitlements"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class EntitlementOut(BaseModel):
    id: str
    code: str
    property_id: str
    feat_render_3d: bool
    feat_walkthrough: bool
    feat_virtual_staging: bool
    feat_floor_plan: bool
    feat_sketch_render: bool
    package_name: str | None
    status: str
    notes: str | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EntitlementCreate(BaseModel):
    feat_render_3d: bool = False
    feat_walkthrough: bool = False
    feat_virtual_staging: bool = False
    feat_floor_plan: bool = False
    feat_sketch_render: bool = False
    package_name: str | None = None
    status: str = "active"
    notes: str | None = None
    expires_at: datetime | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_owned_property(property_id: str, user: User, db: Session) -> Property:
    prop = db.query(Property).filter(
        Property.id == property_id,
        Property.user_id == user.id,
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{property_id}/entitlement", response_model=EntitlementOut | None)
def get_entitlement(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_property(property_id, current_user, db)
    ent = db.query(Entitlement).filter(Entitlement.property_id == property_id).first()
    return ent  # None → no entitlement assigned yet


@router.post("/{property_id}/entitlement", response_model=EntitlementOut, status_code=status.HTTP_201_CREATED)
def upsert_entitlement(
    property_id: str,
    body: EntitlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_property(property_id, current_user, db)

    ent = db.query(Entitlement).filter(Entitlement.property_id == property_id).first()
    if ent:
        # Update existing
        for k, v in body.model_dump(exclude_none=False).items():
            setattr(ent, k, v)
        ent.updated_at = datetime.utcnow()
    else:
        ent = Entitlement(property_id=property_id, **body.model_dump())
        db.add(ent)

    db.commit()
    db.refresh(ent)
    return ent


@router.delete("/{property_id}/entitlement", status_code=status.HTTP_204_NO_CONTENT)
def delete_entitlement(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_property(property_id, current_user, db)
    ent = db.query(Entitlement).filter(Entitlement.property_id == property_id).first()
    if ent:
        db.delete(ent)
        db.commit()
