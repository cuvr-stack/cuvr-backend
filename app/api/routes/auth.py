import random
import logging
import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.api.deps import get_current_user
from app.services.email import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Redis client for OTP storage
_redis = None

def get_redis():
    global _redis
    if _redis is None:
        _redis = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _redis

OTP_TTL = 600  # 10 minutes
OTP_KEY  = "email_verify:{email}"


def _store_otp(email: str, code: str):
    get_redis().setex(OTP_KEY.format(email=email), OTP_TTL, code)


def _get_otp(email: str) -> str | None:
    return get_redis().get(OTP_KEY.format(email=email))


def _delete_otp(email: str):
    get_redis().delete(OTP_KEY.format(email=email))


def _generate_code() -> str:
    return str(random.randint(100000, 999999))


# ── Request / Response models ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    code = _generate_code()
    _store_otp(req.email, code)

    sent = send_verification_email(req.email, code, req.full_name)
    if not sent:
        # Log code for dev environments without SMTP configured
        logger.info(f"[DEV] Verification code for {req.email}: {code}")

    return {"message": "Verification code sent to your email", "email": req.email}


@router.post("/verify-email", response_model=TokenResponse)
def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    stored = _get_otp(req.email)
    if not stored:
        raise HTTPException(status_code=400, detail="Verification code expired or not found. Request a new one.")
    if stored != req.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_verified = True
    db.commit()
    _delete_otp(req.email)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/resend-verification")
def resend_verification(req: ResendVerificationRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    code = _generate_code()
    _store_otp(req.email, code)

    sent = send_verification_email(req.email, code, user.full_name)
    if not sent:
        logger.info(f"[DEV] Verification code for {req.email}: {code}")

    return {"message": "Verification code resent"}


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Please check your inbox.")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(req: RefreshRequest, db: Session = Depends(get_db)):
    user_id = decode_token(req.refresh_token, token_type="refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
        "subscription_plan": current_user.subscription_plan,
        "subscription_status": current_user.subscription_status,
        "created_at": current_user.created_at,
    }


@router.patch("/me")
def update_me(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.full_name:
        current_user.full_name = req.full_name
    db.commit()
    return {"message": "Profile updated"}


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    current_user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": "Password updated"}
