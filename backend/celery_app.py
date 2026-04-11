from celery import Celery
from app.config import settings

celery = Celery(
    "genomics",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.training"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
