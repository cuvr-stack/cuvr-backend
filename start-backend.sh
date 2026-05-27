#!/bin/bash
set -e
cd "$(dirname "$0")"

PYTHON=/opt/anaconda3/bin/python
PIP=/opt/anaconda3/bin/pip

echo "[INFO] Checking dependencies..."
$PIP install fastapi uvicorn pydantic pydantic-settings sqlalchemy alembic \
  psycopg2-binary python-jose passlib python-multipart celery redis boto3 \
  httpx python-dotenv slowapi email-validator stripe google-auth requests \
  aiofiles PyJWT cryptography diffusers accelerate transformers torch \
  --quiet --exists-action i 2>/dev/null || true

echo "[INFO] Starting CUVR Realty backend on http://localhost:8000 ..."
/opt/anaconda3/bin/uvicorn main:app --reload --port 8000
