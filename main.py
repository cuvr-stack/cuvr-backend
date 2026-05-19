from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import auth, properties, photos, tours, subscriptions, dashboard, social_auth, videos
from app.api.routes.ai_features import router as ai_router


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        settings.frontend_url,
    ],
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
    return {"url": f"http://localhost:8000/uploads/{key}"}


# Serve local uploads when AWS S3 is not configured (development mode)
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
