import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.core.config import settings
from app.models.user import User, SubscriptionPlan, SubscriptionStatus
import jwt
import httpx
import uuid

router = APIRouter(prefix="/auth", tags=["social-auth"])


class GoogleLoginRequest(BaseModel):
    credential: str  # Google JWT id_token from frontend


class AppleLoginRequest(BaseModel):
    identity_token: str  # Apple JWT id_token from frontend
    full_name: str | None = None


def _get_or_create_user(db: Session, email: str, full_name: str, provider: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        full_name=full_name or email.split("@")[0],
        hashed_password="",  # social login — no password
        is_active=True,
        is_verified=True,  # trusted provider
        subscription_plan=SubscriptionPlan.free,
        subscription_status=SubscriptionStatus.inactive,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _token_response(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


@router.post("/google")
async def google_login(req: GoogleLoginRequest, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google login not configured")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {req.credential}"},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google access token")
        info = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google verification failed: {e}")

    email = info.get("email")
    full_name = info.get("name", "")
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Google")

    user = _get_or_create_user(db, email, full_name, "google")
    return _token_response(user)


@router.post("/apple")
async def apple_login(req: AppleLoginRequest, db: Session = Depends(get_db)):
    if not settings.apple_client_id:
        raise HTTPException(status_code=501, detail="Apple login not configured")
    try:
        # Fetch Apple's public keys
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://appleid.apple.com/auth/keys")
            apple_keys = resp.json()

        # Decode header to find which key to use
        header = jwt.get_unverified_header(req.identity_token)
        key_data = next((k for k in apple_keys["keys"] if k["kid"] == header["kid"]), None)
        if not key_data:
            raise HTTPException(status_code=401, detail="Apple key not found")

        from jwt.algorithms import RSAAlgorithm
        public_key = RSAAlgorithm.from_jwk(key_data)

        payload = jwt.decode(
            req.identity_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Apple token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Apple token: {e}")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by Apple")

    full_name = req.full_name or email.split("@")[0]
    user = _get_or_create_user(db, email, full_name, "apple")
    return _token_response(user)
