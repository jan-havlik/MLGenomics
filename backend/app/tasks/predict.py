"""
Celery apply task: run a saved library model on a target genome/chromosome.

This is the cross-organism detection flow — e.g. train on a G4Hunter BED for
hg38/chr21, then detect on mm39/chrX. The target chromosome is extracted with
the *same* window size the model was trained with (read from model_meta.json),
so the feature matrix matches what the model expects.
"""
from __future__ import annotations

import gc
import json
import uuid
from datetime import datetime, timezone

import joblib
import pandas as pd
import redis

from celery_app import celery
from app.config import settings
from app.core.export import bedgraph_to_bigwig, predict_probs, write_bedgraph, write_highconf_bed
from app.core.genomes import is_valid
from app.tasks.extraction import ensure_feature_parquet


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _update_job(r: redis.Redis, job_id: str, updates: dict) -> None:
    key = f"job:{job_id}"
    current = json.loads(r.get(key) or "{}")
    current.update(updates)
    r.setex(key, settings.job_ttl_seconds, json.dumps(current))


@celery.task(bind=True, name="tasks.apply_model")
def apply_model(self, job_id: str, library_name: str, genome: str, chromosome: str) -> dict:
    r = _redis()

    def stage(label: str, progress: float) -> None:
        _update_job(r, job_id, {"status": "running", "progress": progress, "stage": label})

    stage("Initializing", 0.03)

    try:
        if not is_valid(genome, chromosome):
            raise ValueError(f"Unknown genome/chromosome: {genome}/{chromosome}")

        lib_dir = settings.library_dir / library_name
        meta_path = lib_dir / "model_meta.json"
        model_path = lib_dir / "model.joblib"
        if not meta_path.exists() or not model_path.exists():
            raise ValueError(f"Library model '{library_name}' not found")

        meta = json.loads(meta_path.read_text())
        feature_cols = meta["feature_cols"]
        window_size = int(meta.get("window_size", 200))  # legacy models → 200
        step_size = int(meta.get("step_size", window_size))

        # ── Extract target features at the model's window (cached per window) ──
        def extract_progress(frac: float, msg: str) -> None:
            stage(msg, 0.08 + 0.62 * frac)  # extraction dominates an apply job

        stage(f"Preparing {genome}/{chromosome} at {window_size} bp windows", 0.08)
        parquet_path = ensure_feature_parquet(
            genome, chromosome, window_size, step_size, progress=extract_progress,
        )
        needed_cols = ["_start", "_end"] + feature_cols
        df = pd.read_parquet(parquet_path, columns=needed_cols)

        starts = df["_start"].values.copy()
        ends = df["_end"].values.copy()
        X = df[feature_cols].values.astype("float32")
        del df
        gc.collect()

        # ── Predict ───────────────────────────────────────────────────────────
        stage(f"Scoring {len(starts):,} windows", 0.78)
        model = joblib.load(model_path)
        probs = predict_probs(model, X)
        del X
        gc.collect()

        # ── Write outputs ─────────────────────────────────────────────────────
        stage("Generating outputs", 0.90)
        job_dir = settings.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        bg_path = job_dir / "predictions.bedGraph"
        bw_path = job_dir / "predictions.bw"
        hc_path = job_dir / "highconf.bed"

        write_bedgraph(starts, ends, probs, chromosome, bg_path, track_name=library_name)
        n_hc = write_highconf_bed(starts, ends, probs, chromosome, hc_path, track_name=library_name)
        try:
            bedgraph_to_bigwig(bg_path, bw_path, chromosome, int(ends.max()))
        except Exception as bw_err:
            stage(f"bigWig conversion skipped: {bw_err}", 0.93)

        info = json.loads((lib_dir / "library_info.json").read_text())
        n_windows_total = int(len(starts))
        _update_job(r, job_id, {
            "status": "completed",
            "progress": 1.0,
            "stage": f"Done · {n_hc:,} high-confidence regions",
            "metrics": {
                # No labels on the target, so ranking/operating-point metrics
                # come from the model's original training job (carried in info).
                "auc": info.get("auc"),
                "ap": info.get("ap"),
                "cv_auc_mean": 0.0,
                "cv_auc_std": 0.0,
                "n_positives": 0,
                "n_negatives": 0,
                "n_highconf_regions": n_hc,
                "n_windows_total": n_windows_total,
                "flagged_fraction": round(n_hc / n_windows_total, 6) if n_windows_total else 0.0,
                "flagged_bp": int(n_hc) * int(window_size),
            },
            "feature_importance": None,
        })

    except Exception as exc:
        _update_job(r, job_id, {
            "status": "failed", "progress": 0.0, "stage": None, "error": str(exc),
        })
        raise

    return {"job_id": job_id, "status": "completed"}
