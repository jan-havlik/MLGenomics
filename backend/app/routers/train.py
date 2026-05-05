import json
import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.rate_limit import rate_limit
from app.schemas.training import TrainRequest
from app.tasks.training import train_model

router = APIRouter(prefix="/api/jobs", tags=["train"])


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


@router.post("", status_code=202, dependencies=[Depends(rate_limit("submit", 5))])
async def submit_job(
    config: str = Form(..., description="JSON-serialised TrainRequest"),
    bed_file: UploadFile | None = File(None, description="BED file with positive labels"),
):
    # Parse and validate config
    try:
        req = TrainRequest(**json.loads(config))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Supervised models require a BED file
    if req.model_type != "isolation_forest" and bed_file is None:
        raise HTTPException(
            status_code=422,
            detail="bed_file is required for supervised models (xgboost, random_forest)",
        )

    bed_content: str | None = None
    if bed_file is not None:
        raw = await bed_file.read()
        if len(raw) > settings.max_bed_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"BED file too large: {len(raw):,} bytes (max {settings.max_bed_bytes:,})",
            )
        bed_content = raw.decode("utf-8", errors="replace")

    # Create job record
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    r = _redis()
    r.setex(
        f"job:{job_id}",
        settings.job_ttl_seconds,
        json.dumps({
            "job_id": job_id,
            "status": "pending",
            "progress": 0.0,
            "model_type": req.model_type,
            "genome": req.genome,
            "chromosome": req.chromosome,
            "created_at": now,
        }),
    )

    # Dispatch Celery task
    train_model.delay(job_id, bed_content, req.model_dump())

    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "pending"},
    )
