from celery import Celery
from celery.signals import worker_ready
from app.core.config import settings

celery_app = Celery(
    "cuvr_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks", "app.workers.floor_plan_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        # Fast queue: photo upload processing (depth map + thumbnail) — must not be blocked by AI
        "app.workers.tasks.process_photo_task": {"queue": "photos"},
        # Slow queue: AI render tasks that can take 5-10 minutes
        "app.workers.tasks.render_sketch_task": {"queue": "ai"},
        "app.workers.tasks.stage_room_task":    {"queue": "ai"},
        "app.workers.tasks.process_video_task":              {"queue": "ai"},
        "app.workers.floor_plan_tasks.process_floor_plan_task": {"queue": "ai"},
    },
)


@worker_ready.connect
def reset_stuck_photos(sender=None, **kwargs):
    """On worker start: reset any photos stuck in 'processing' back to 'pending'.
    This handles cases where the worker crashed mid-task without updating the DB."""
    try:
        from app.core.database import SessionLocal
        from app.models.photo import Photo, ProcessingStatus
        db = SessionLocal()
        stuck = db.query(Photo).filter(Photo.processing_status == ProcessingStatus.processing).all()
        if stuck:
            for p in stuck:
                p.processing_status = ProcessingStatus.pending
                p.processing_progress = 0
            db.commit()
            print(f"[worker_ready] Reset {len(stuck)} stuck photo(s) to pending.")
        db.close()
    except Exception as e:
        print(f"[worker_ready] Could not reset stuck photos: {e}")
