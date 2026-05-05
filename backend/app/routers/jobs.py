import json
import shutil
import uuid
from datetime import datetime

import redis
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.schemas.job import JobStatus, JobListItem, JobMetrics

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _validate_job_id(job_id: str) -> None:
    """Reject anything that isn't a UUID — defends every job_id-keyed
    filesystem operation against path traversal attempts."""
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job_id")


def _load_job(r: redis.Redis, job_id: str) -> dict:
    _validate_job_id(job_id)
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
            genome=d.get("genome", "hg38"),
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
        stage=d.get("stage"),
        model_type=d["model_type"],
        genome=d.get("genome", "hg38"),
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


@router.get("/{job_id}/export.bw")
def export_job_bigwig(job_id: str):
    r = _redis()
    d = _load_job(r, job_id)
    if d["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed yet")

    bw_path = settings.jobs_dir / job_id / "predictions.bw"
    bg_path = settings.jobs_dir / job_id / "predictions.bedGraph"

    # Lazy-generate for jobs that completed before bigWig support was added.
    if not bw_path.exists():
        if not bg_path.exists():
            raise HTTPException(status_code=404, detail="No prediction file found")
        from app.core.export import bedgraph_to_bigwig
        chrom = d["chromosome"]
        max_end = 0
        with open(bg_path) as fh:
            for line in fh:
                if line.startswith(("track", "#", "browser")):
                    continue
                cols = line.rstrip().split("\t")
                if len(cols) >= 3:
                    try:
                        max_end = max(max_end, int(cols[2]))
                    except ValueError:
                        continue
        if max_end == 0:
            raise HTTPException(status_code=500, detail="bedGraph has no usable rows")
        try:
            bedgraph_to_bigwig(bg_path, bw_path, chrom, max_end)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"bigWig conversion failed: {e}")

    return FileResponse(
        path=str(bw_path),
        media_type="application/octet-stream",
        filename=f"predictions_{job_id[:8]}.bw",
        headers={"Accept-Ranges": "bytes"},
    )


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str):
    r = _redis()
    _load_job(r, job_id)  # 404 if missing
    r.delete(f"job:{job_id}")
    job_dir = settings.jobs_dir / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
