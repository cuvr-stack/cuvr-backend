import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import auth, properties, photos, tours, subscriptions, dashboard, social_auth, videos
from app.api.routes.ai_features import router as ai_router

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://reality.cuvr.ae",
    "https://app.cuvr.ae",
    "https://cuvr-reality-dashboard.vercel.app",
    settings.frontend_url,
]


class StaticFilesCORSMiddleware(BaseHTTPMiddleware):
    """Add CORS headers to /uploads/* static file responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/uploads/"):
            origin = request.headers.get("origin", "")
            if origin in ALLOWED_ORIGINS:
                response.headers["Access-Control-Allow-Origin"] = origin
            else:
                response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
        return response


@asynccontextmanager
async def lifespan(app):
    # Create tables on startup — fails gracefully with a clear message
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"\n[ERROR] Could not connect to database: {e}")
        print("[ERROR] Make sure PostgreSQL is running and DATABASE_URL in .env is correct.\n")
    yield


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(StaticFilesCORSMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(properties.router, prefix="/api")
app.include_router(photos.router, prefix="/api")
app.include_router(tours.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(social_auth.router, prefix="/api")
app.include_router(videos.router, prefix="/api")
app.include_router(ai_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


@app.post("/api/internal/store-file")
async def store_file(request: Request, key: str):
    """Internal endpoint: remote workers (Colab/RunPod) POST rendered files here."""
    content = await request.body()
    path = _uploads_dir / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    base = (settings.public_api_url or "http://localhost:8000").rstrip("/")
    return {"url": f"{base}/uploads/{key}"}


# Serve local uploads when AWS S3 is not configured (development mode)
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
