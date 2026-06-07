import smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.feature_request import FeatureRequest
from app.models.entitlement import Entitlement
from app.models.property import Property
from app.models.user import User
from app.core.config import settings

router = APIRouter(tags=["feature-requests"])
SUPERADMIN_EMAIL = "nikhil.louis@cuvr.ae"
FEATURE_LABELS = {
    "feat_render_3d": "3D Render", "feat_walkthrough": "VR Walkthrough",
    "feat_virtual_staging": "Virtual Staging", "feat_floor_plan": "Floor Plan",
    "feat_sketch_render": "Sketch Render",
}

def _is_superadmin(user: User) -> bool:
    return getattr(user, "is_superadmin", False) or user.email == SUPERADMIN_EMAIL

def _send_email(to: str, subject: str, html: str):
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject; msg["From"] = settings.smtp_user; msg["To"] = to
        msg.attach(MIMEText(html, "html"))
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.smtp_host, int(settings.smtp_port), context=ctx) as s:
            s.login(settings.smtp_user, settings.smtp_password)
            s.sendmail(settings.smtp_user, to, msg.as_string())
    except Exception as e:
        print(f"[EMAIL] Failed: {e}")

class RequestCreate(BaseModel):
    feature: str
    message: str | None = None

class RequestOut(BaseModel):
    id: str; property_id: str; user_id: str; feature: str; status: str
    message: str | None; admin_note: str | None; created_at: datetime
    property_name: str | None = None; user_email: str | None = None
    entitlement_code: str | None = None
    model_config = {"from_attributes": True}

class AdminAction(BaseModel):
    admin_note: str | None = None

@router.post("/api/properties/{property_id}/feature-requests", response_model=RequestOut, status_code=201)
def request_feature(property_id: str, body: RequestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    prop = db.query(Property).filter(Property.id == property_id, Property.user_id == current_user.id).first()
    if not prop: raise HTTPException(404, "Property not found")
    existing = db.query(FeatureRequest).filter(FeatureRequest.property_id == property_id, FeatureRequest.feature == body.feature, FeatureRequest.status == "pending").first()
    if existing: return existing
    req = FeatureRequest(property_id=property_id, user_id=current_user.id, feature=body.feature, message=body.message)
    db.add(req); db.commit(); db.refresh(req)
    label = FEATURE_LABELS.get(body.feature, body.feature)
    _send_email(SUPERADMIN_EMAIL, f"[CUVR] Feature Request — {label} for \"{prop.name}\"",
        f"<h2>New Feature Access Request</h2><p><b>Project:</b> {prop.name}<br><b>Feature:</b> {label}<br><b>User:</b> {current_user.email}</p>"
        f"<p><a href='https://app.cuvr.ae/dashboard/admin' style='background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none'>Review in Admin Panel →</a></p>")
    return req

@router.get("/api/properties/{property_id}/feature-requests", response_model=list[RequestOut])
def get_my_requests(property_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    prop = db.query(Property).filter(Property.id == property_id, Property.user_id == current_user.id).first()
    if not prop: raise HTTPException(404)
    return db.query(FeatureRequest).filter(FeatureRequest.property_id == property_id).all()

@router.get("/api/admin/feature-requests/count")
def pending_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_superadmin(current_user): return {"count": 0}
    return {"count": db.query(FeatureRequest).filter(FeatureRequest.status == "pending").count()}

@router.get("/api/admin/feature-requests", response_model=list[RequestOut])
def list_requests(status: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_superadmin(current_user): raise HTTPException(403, "Admin only")
    q = db.query(FeatureRequest)
    if status: q = q.filter(FeatureRequest.status == status)
    result = []
    for r in q.order_by(FeatureRequest.created_at.desc()).all():
        out = RequestOut.model_validate(r)
        out.property_name = r.property.name if r.property else None
        out.user_email = r.user.email if r.user else None
        ent = db.query(Entitlement).filter(Entitlement.property_id == r.property_id).first()
        out.entitlement_code = ent.code if ent else None
        result.append(out)
    return result

@router.post("/api/admin/feature-requests/{request_id}/approve", response_model=RequestOut)
def approve_request(request_id: str, body: AdminAction = AdminAction(), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_superadmin(current_user): raise HTTPException(403)
    req = db.query(FeatureRequest).filter(FeatureRequest.id == request_id).first()
    if not req: raise HTTPException(404)
    ent = db.query(Entitlement).filter(Entitlement.property_id == req.property_id).first()
    if not ent: ent = Entitlement(property_id=req.property_id); db.add(ent)
    setattr(ent, req.feature, True); ent.status = "active"; ent.updated_at = datetime.utcnow()
    req.status = "approved"; req.admin_note = body.admin_note; req.updated_at = datetime.utcnow()
    db.commit(); db.refresh(req)
    label = FEATURE_LABELS.get(req.feature, req.feature)
    _send_email(req.user.email, f"[CUVR] {label} activated for your project",
        f"<h2>Feature Activated ✓</h2><p><b>{label}</b> is now active for <b>{req.property.name}</b>. Entitlement: <b>{ent.code}</b></p>"
        f"<p><a href='https://app.cuvr.ae/dashboard/properties/{req.property_id}' style='background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none'>Open Project →</a></p>")
    return req

@router.post("/api/admin/feature-requests/{request_id}/reject", response_model=RequestOut)
def reject_request(request_id: str, body: AdminAction = AdminAction(), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_superadmin(current_user): raise HTTPException(403)
    req = db.query(FeatureRequest).filter(FeatureRequest.id == request_id).first()
    if not req: raise HTTPException(404)
    req.status = "rejected"; req.admin_note = body.admin_note; req.updated_at = datetime.utcnow()
    db.commit(); db.refresh(req); return req
