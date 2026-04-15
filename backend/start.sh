#!/bin/sh
set -e

if [ "${START_MODE}" = "worker" ]; then
  exec celery -A celery_app.celery worker --loglevel=info --concurrency=2
else
  exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
fi
