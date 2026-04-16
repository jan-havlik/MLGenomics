#!/bin/bash
set -e

# Run Celery worker and Uvicorn in the same container so they share the
# /var/data volume (Railway volumes are per-service, so we can't split them).
celery -A celery_app.celery worker --loglevel=info --concurrency=2 &
celery_pid=$!

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" &
uvicorn_pid=$!

cleanup() {
  kill -TERM "$celery_pid" "$uvicorn_pid" 2>/dev/null || true
  wait
}
trap cleanup INT TERM

# Exit as soon as either process dies so Railway restarts the container.
wait -n
cleanup
exit 1
