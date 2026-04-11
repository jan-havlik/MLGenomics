import json
import shutil
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.schemas.job import JobStatus, JobListItem, JobMetrics

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _load_job(r: redis.Redis, job_id: str) -> dict:
    raw = r.get(f"job:{job_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)


@router.get("", response_model=list[JobListItem])
def list_jobs():
    r = _redis()
    keys = r.keys("job:*")
    items = []
    for key in keys:
        raw = r.get(key)
        if not raw:
            continue
        d = json.loads(raw)
        items.append(JobListItem(
            job_id=d["job_id"],
            status=d["status"],
            model_type=d["model_type"],
            chromosome=d["chromosome"],
            created_at=datetime.fromisoformat(d["created_at"]),
            auc=d.get("metrics", {}).get("auc") if d.get("metrics") else None,
        ))
    items.sort(key=lambda x: x.created_at, reverse=True)
    return items


@router.get("/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    r = _redis()
    d = _load_job(r, job_id)
    metrics = None
    if d.get("metrics"):
        metrics = JobMetrics(**d["metrics"])
    return JobStatus(
        job_id=d["job_id"],
        status=d["status"],
        progress=d.get("progress", 0.0),
        model_type=d["model_type"],
        chromosome=d["chromosome"],
        created_at=datetime.fromisoformat(d["created_at"]),
        metrics=metrics,
        feature_importance=d.get("feature_importance"),
        error=d.get("error"),
    )


@router.get("/{job_id}/export")
def export_job(job_id: str):
    r = _redis()
    d = _load_job(r, job_id)
    if d["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed yet")
    bg_path = settings.jobs_dir / job_id / "predictions.bedGraph"
    if not bg_path.exists():
        raise HTTPException(status_code=404, detail="BedGraph file not found")
    return FileResponse(
        path=str(bg_path),
        media_type="text/plain",
        filename=f"predictions_{job_id[:8]}.bedGraph",
    )


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str):
    r = _redis()
    _load_job(r, job_id)  # 404 if missing
    r.delete(f"job:{job_id}")
    job_dir = settings.jobs_dir / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
