#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! redis-cli ping &>/dev/null; then
  echo "[ERROR] Redis is not running. Start it with: brew services start redis"
  exit 1
fi

PYTHON=/opt/anaconda3/bin/python

# macOS: prevent SIGABRT crash when forking with PyTorch/MPS/Objective-C loaded
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

# Kill any existing workers
pkill -f "celery.*cuvr_worker" 2>/dev/null || true
sleep 1

echo "[INFO] Starting photo worker (fast — depth maps & thumbnails)..."
$PYTHON -m celery -A app.workers.celery_app.celery_app worker \
  --pool=solo \
  --queues=photos,celery \
  --hostname=photo-worker@%h \
  --loglevel=info &
PHOTO_WORKER_PID=$!

echo "[INFO] Starting AI worker (slow — sketch render, staging, video)..."
$PYTHON -m celery -A app.workers.celery_app.celery_app worker \
  --pool=solo \
  --queues=ai \
  --hostname=ai-worker@%h \
  --loglevel=info &
AI_WORKER_PID=$!

echo "[INFO] Photo worker PID: $PHOTO_WORKER_PID"
echo "[INFO] AI worker PID:    $AI_WORKER_PID"
echo "[INFO] Both workers running. Press Ctrl+C to stop."

# Wait for both — if either dies, kill the other
wait $PHOTO_WORKER_PID $AI_WORKER_PID
