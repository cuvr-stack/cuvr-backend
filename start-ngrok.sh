#!/bin/bash
# Expose local services to Google Colab using bore (free, no account needed)
# bore is already installed via: brew install bore-cli

set -e
cd "$(dirname "$0")"

if ! command -v bore &>/dev/null; then
  echo "[ERROR] bore not installed. Run: brew install bore-cli"
  exit 1
fi

echo "[INFO] Opening tunnels via bore.pub (free, no account needed)..."
echo ""

# Start 3 tunnels in background, capture their output to temp files
bore local 6379 --to bore.pub > /tmp/bore-redis.log 2>&1 &
BORE_REDIS=$!

bore local 5432 --to bore.pub > /tmp/bore-postgres.log 2>&1 &
BORE_PG=$!

bore local 8000 --to bore.pub > /tmp/bore-backend.log 2>&1 &
BORE_HTTP=$!

echo "[INFO] Waiting for tunnels to open..."
sleep 5

# Parse ports from bore output (bore prints: "listening at bore.pub:PORT")
REDIS_PORT=$(grep -o "bore.pub:[0-9]*" /tmp/bore-redis.log 2>/dev/null | head -1 | cut -d: -f2)
PG_PORT=$(grep -o "bore.pub:[0-9]*" /tmp/bore-postgres.log 2>/dev/null | head -1 | cut -d: -f2)
HTTP_PORT=$(grep -o "bore.pub:[0-9]*" /tmp/bore-backend.log 2>/dev/null | head -1 | cut -d: -f2)

if [ -z "$REDIS_PORT" ] || [ -z "$PG_PORT" ] || [ -z "$HTTP_PORT" ]; then
  echo "[ERROR] Some tunnels failed to open. Logs:"
  cat /tmp/bore-redis.log
  cat /tmp/bore-postgres.log
  cat /tmp/bore-backend.log
  kill $BORE_REDIS $BORE_PG $BORE_HTTP 2>/dev/null
  exit 1
fi

# Get local DB name
DB_NAME=$(grep DATABASE_URL .env | head -1 | sed 's/.*\///' | tr -d '[:space:]')

echo ""
echo "=========================================="
echo "  Paste these into Colab Cell 2:"
echo "=========================================="
echo ""
echo "REDIS_URL    = \"redis://bore.pub:${REDIS_PORT}/0\""
echo "DATABASE_URL = \"postgresql://localhost/${DB_NAME}?host=bore.pub&port=${PG_PORT}\""
echo "BACKEND_URL  = \"http://bore.pub:${HTTP_PORT}\""
echo ""
echo "=========================================="
echo ""
echo "[INFO] Tunnels running. Press Ctrl+C to stop."
echo ""

# Keep running until Ctrl+C
trap "kill $BORE_REDIS $BORE_PG $BORE_HTTP 2>/dev/null; echo 'Tunnels closed.'" EXIT
wait $BORE_REDIS $BORE_PG $BORE_HTTP
