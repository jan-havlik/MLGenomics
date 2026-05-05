"""
Model library — save trained models, share as zip bundles, re-run predictions.

Endpoints
---------
POST   /api/jobs/{job_id}/save          Promote a completed job's model to the library
GET    /api/library                     List all library models
GET    /api/library/{name}              Single model detail
DELETE /api/library/{name}              Remove a library model
PATCH  /api/library/{name}              Rename / update tags
GET    /api/library/{name}/export       Download zip bundle
POST   /api/library/import              Upload zip → register model
POST   /api/library/{name}/predict      Run predictions instantly (no retraining)
"""
from __future__ import annotations

import io
import json
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import redis as redis_mod
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core.export import predict_probs, write_bedgraph, write_highconf_bed
from app.schemas.library import (
    LibraryModelInfo,
    PatchLibraryRequest,
    SaveToLibraryRequest,
)

router = APIRouter(tags=["library"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _redis() -> redis_mod.Redis:
    return redis_mod.from_url(settings.redis_url, decode_responses=True)


def _load_job_redis(r: redis_mod.Redis, job_id: str) -> dict:
    raw = r.get(f"job:{job_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)


def _lib_dir(name: str) -> Path:
    _validate_slug(name)
    return settings.library_dir / name


def _read_info(name: str) -> LibraryModelInfo:
    info_path = _lib_dir(name) / "library_info.json"
    meta_path = _lib_dir(name) / "model_meta.json"
    if not info_path.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Library model '{name}' not found")
    info = json.loads(info_path.read_text())
    meta = json.loads(meta_path.read_text())
    return LibraryModelInfo(
        name=name,
        display_name=info["display_name"],
        description=info.get("description", ""),
        model_type=meta["model_type"],
        chromosome=meta["chromosome"],
        auc=info.get("auc"),
        ap=info.get("ap"),
        n_features=len(meta["feature_cols"]),
        feature_cols=meta["feature_cols"],
        tags=info.get("tags", []),
        created_at=datetime.fromisoformat(info["created_at"]),
    )


def _validate_slug(name: str) -> None:
    import re
    if not re.match(r"^[a-z0-9][a-z0-9\-]{0,62}$", name):
        raise HTTPException(
            status_code=422,
            detail="Name must be a lowercase slug (letters, digits, hyphens; max 63 chars)",
        )


# ---------------------------------------------------------------------------
# Save a completed job to the library
# ---------------------------------------------------------------------------

@router.post("/api/jobs/{job_id}/save", response_model=LibraryModelInfo, status_code=201)
def save_to_library(job_id: str, req: SaveToLibraryRequest):
    _validate_slug(req.name)

    r = _redis()
    d = _load_job_redis(r, job_id)
    if d["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed before saving")

    job_dir = settings.jobs_dir / job_id
    model_path = job_dir / "model.joblib"
    meta_path = job_dir / "model_meta.json"
    if not model_path.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail="Model files not found for this job")

    dest = _lib_dir(req.name)
    if dest.exists():
        raise HTTPException(status_code=409, detail=f"Library model '{req.name}' already exists")
    dest.mkdir(parents=True)

    shutil.copy2(model_path, dest / "model.joblib")
    shutil.copy2(meta_path, dest / "model_meta.json")

    metrics = d.get("metrics") or {}
    info = {
        "display_name": req.display_name,
        "description": req.description,
        "tags": req.tags,
        "auc": metrics.get("auc"),
        "ap": metrics.get("ap"),
        "source_job_id": job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (dest / "library_info.json").write_text(json.dumps(info, indent=2))

    return _read_info(req.name)


# ---------------------------------------------------------------------------
# List / get library models
# ---------------------------------------------------------------------------

@router.get("/api/library", response_model=list[LibraryModelInfo])
def list_library():
    result = []
    for entry in settings.library_dir.iterdir():
        if not entry.is_dir():
            continue
        try:
            result.append(_read_info(entry.name))
        except HTTPException:
            continue
    result.sort(key=lambda m: m.created_at, reverse=True)
    return result


@router.get("/api/library/{name}", response_model=LibraryModelInfo)
def get_library_model(name: str):
    return _read_info(name)


# ---------------------------------------------------------------------------
# Update / delete
# ---------------------------------------------------------------------------

@router.patch("/api/library/{name}", response_model=LibraryModelInfo)
def patch_library_model(name: str, req: PatchLibraryRequest):
    info_path = _lib_dir(name) / "library_info.json"
    if not info_path.exists():
        raise HTTPException(status_code=404, detail=f"Library model '{name}' not found")
    info = json.loads(info_path.read_text())
    if req.display_name is not None:
        info["display_name"] = req.display_name
    if req.description is not None:
        info["description"] = req.description
    if req.tags is not None:
        info["tags"] = req.tags
    info_path.write_text(json.dumps(info, indent=2))
    return _read_info(name)


@router.delete("/api/library/{name}", status_code=204)
def delete_library_model(name: str):
    dest = _lib_dir(name)
    if not dest.exists():
        raise HTTPException(status_code=404, detail=f"Library model '{name}' not found")
    shutil.rmtree(dest)


# ---------------------------------------------------------------------------
# Export as zip bundle
# ---------------------------------------------------------------------------

@router.get("/api/library/{name}/export")
def export_library_model(name: str):
    dest = _lib_dir(name)
    if not dest.exists():
        raise HTTPException(status_code=404, detail=f"Library model '{name}' not found")

    meta = json.loads((dest / "model_meta.json").read_text())
    features_csv = "\n".join(meta["feature_cols"])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(dest / "model.joblib", "model.joblib")
        zf.write(dest / "model_meta.json", "model_meta.json")
        zf.write(dest / "library_info.json", "library_info.json")
        zf.writestr("features.csv", features_csv)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}.zip"'},
    )


# ---------------------------------------------------------------------------
# Import from zip bundle
# ---------------------------------------------------------------------------

@router.post("/api/library/import", response_model=LibraryModelInfo, status_code=201)
async def import_library_model(file: UploadFile):
    data = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid zip archive")

    names_in_zip = zf.namelist()
    if "model.joblib" not in names_in_zip or "model_meta.json" not in names_in_zip:
        raise HTTPException(
            status_code=422,
            detail="Zip must contain model.joblib and model_meta.json",
        )

    meta = json.loads(zf.read("model_meta.json"))
    if "library_info.json" in names_in_zip:
        info = json.loads(zf.read("library_info.json"))
    else:
        info = {
            "display_name": meta.get("model_type", "imported"),
            "description": "",
            "tags": [],
            "auc": None,
            "ap": None,
            "source_job_id": meta.get("job_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    # Derive a unique slug from display_name
    import re
    base = re.sub(r"[^a-z0-9]+", "-", info["display_name"].lower()).strip("-") or "imported"
    slug = base
    counter = 1
    while _lib_dir(slug).exists():
        slug = f"{base}-{counter}"
        counter += 1

    dest = _lib_dir(slug)
    dest.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as tmp:
        zf.extractall(tmp)
        shutil.copy2(Path(tmp) / "model.joblib", dest / "model.joblib")
        shutil.copy2(Path(tmp) / "model_meta.json", dest / "model_meta.json")

    if "created_at" not in info:
        info["created_at"] = datetime.now(timezone.utc).isoformat()
    (dest / "library_info.json").write_text(json.dumps(info, indent=2))

    return _read_info(slug)


# ---------------------------------------------------------------------------
# Run predictions with a library model (no training)
# ---------------------------------------------------------------------------

@router.post("/api/library/{name}/predict")
def library_predict(name: str):
    dest = _lib_dir(name)
    if not dest.exists():
        raise HTTPException(status_code=404, detail=f"Library model '{name}' not found")

    meta = json.loads((dest / "model_meta.json").read_text())
    info = json.loads((dest / "library_info.json").read_text())
    feature_cols = meta["feature_cols"]
    chromosome = meta["chromosome"]
    genome = meta.get("genome", "hg38")  # legacy library models predate the genome field
    model_type = meta["model_type"]

    from app.tasks.extraction import cache_path
    parquet_path = cache_path(genome, chromosome)
    if not parquet_path.exists():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Feature cache missing for {genome}/{chromosome}. "
                f"Trigger extraction via POST /api/genome/{genome}/chromosome/{chromosome}/prepare first."
            ),
        )

    df = pd.read_parquet(parquet_path)
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Feature matrix missing columns: {missing[:5]}",
        )

    model = joblib.load(dest / "model.joblib")
    probs = predict_probs(model, df, feature_cols)

    # Write outputs to a new job dir
    job_id = str(uuid.uuid4())
    job_dir = settings.jobs_dir / job_id
    job_dir.mkdir(parents=True)
    write_bedgraph(df, probs, chromosome, job_dir / "predictions.bedGraph", track_name=name)
    n_highconf = write_highconf_bed(df, probs, chromosome, job_dir / "highconf.bed", track_name=name)

    # Create a completed job record in Redis (no TTL extension — uses default)
    now = datetime.now(timezone.utc).isoformat()
    job_record = {
        "job_id": job_id,
        "status": "completed",
        "progress": 1.0,
        "model_type": model_type,
        "chromosome": chromosome,
        "created_at": now,
        "metrics": {
            "auc": info.get("auc"),
            "ap": info.get("ap"),
            "cv_auc_mean": 0.0,
            "cv_auc_std": 0.0,
            "n_positives": 0,
            "n_negatives": 0,
            "n_highconf_regions": n_highconf,
        },
        "feature_importance": None,
        "error": None,
        "library_model": name,
    }
    r = _redis()
    r.setex(f"job:{job_id}", settings.job_ttl_seconds, json.dumps(job_record))

    return {"job_id": job_id}
