import json

import redis as redis_lib
from celery import Celery
from celery.signals import task_failure

from app.config import settings

celery = Celery(
    "genomics",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.training", "app.tasks.extraction"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)


@task_failure.connect
def on_task_failure(task_id, exception, args, kwargs, traceback, einfo, sender=None, **kw):
    """
    Runs in the main worker process — catches WorkerLostError (SIGKILL/OOM)
    that the task's own except block can never handle.
    """
    from billiard.exceptions import WorkerLostError

    if not isinstance(exception, WorkerLostError):
        return

    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    task_name = getattr(sender, "name", None)

    if task_name == "tasks.train_model":
        # args = (job_id, bed_content, config)
        job_id = args[0] if args else None
        if not job_id:
            return
        key = f"job:{job_id}"
        current = json.loads(r.get(key) or "{}")
        current.update({
            "status": "failed",
            "progress": 0.0,
            "error": "Training was terminated by the server (out of memory). Try selecting fewer features or using a smaller dataset.",
        })
        r.setex(key, settings.job_ttl_seconds, json.dumps(current))

    elif task_name == "tasks.extract_chromosome_features":
        # args = (genome, chrom) — surface OOM instead of leaving the cache_job key in "running" forever.
        genome = args[0] if args else None
        chrom = args[1] if len(args) > 1 else None
        if not (genome and chrom):
            return
        key = f"cache_job:{genome}:{chrom}"
        current = json.loads(r.get(key) or "{}")
        current.update({
            "status": "failed",
            "progress": 0.0,
            "stage": None,
            "error": "Extraction was terminated by the server (out of memory). Try a smaller chromosome or restart the worker.",
        })
        r.setex(key, 3600, json.dumps(current))
