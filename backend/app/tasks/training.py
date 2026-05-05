"""
Celery training task.

Flow:
  1. Load pre-computed feature matrix (Parquet) — only needed columns
  2. Extract position arrays (start/end) for export
  3. Parse uploaded BED file → label windows
  4. Extract full feature matrix, then free the DataFrame
  5. Balance dataset + train/test split
  6. Train model (XGBoost / RF / IsoForest) + 5-fold CV
  7. Predict on all 200k windows
  8. Write bedGraph + high-conf BED to disk
  9. Persist metrics in Redis
  10. Update job status
"""
from __future__ import annotations

import gc
import json
from pathlib import Path

import numpy as np
import pandas as pd
import redis

from celery_app import celery
from app.config import settings
from app.core.features import FEATURE_NAMES
from app.core.genomes import is_valid
from app.core.models import (
    train_xgboost, train_random_forest, train_isolation_forest,
    run_cv, balance_and_split, feature_importance_dict,
)
from app.core.export import bedgraph_to_bigwig, predict_probs, write_bedgraph, write_highconf_bed
from app.tasks.extraction import cache_path


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _update_job(r: redis.Redis, job_id: str, updates: dict) -> None:
    key = f"job:{job_id}"
    current = json.loads(r.get(key) or "{}")
    current.update(updates)
    r.setex(key, settings.job_ttl_seconds, json.dumps(current))


def _parse_bed_labels(bed_content: str, starts: np.ndarray, ends: np.ndarray) -> np.ndarray:
    """
    Parse BED file content and label each window.
    A window is positive if it overlaps any BED region.
    Returns an int32 array aligned to the window arrays.
    """
    positive_intervals: list[tuple[int, int]] = []
    for line in bed_content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("track") or line.startswith("browser"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            parts = line.split()
        if len(parts) < 3:
            continue
        try:
            start, end = int(parts[1]), int(parts[2])
            positive_intervals.append((start, end))
        except ValueError:
            continue

    if not positive_intervals:
        raise ValueError("BED file contains no valid regions")

    labels = np.zeros(len(starts), dtype=np.int32)
    for bed_s, bed_e in positive_intervals:
        overlap = (starts < bed_e) & (ends > bed_s)
        labels |= overlap.astype(np.int32)

    return labels


@celery.task(bind=True, name="tasks.train_model")
def train_model(
    self,
    job_id: str,
    bed_content: str | None,  # None for IsolationForest
    config: dict,
) -> dict:
    r = _redis()

    def stage(label: str, progress: float) -> None:
        _update_job(r, job_id, {
            "status": "running",
            "progress": progress,
            "stage": label,
        })

    stage("Initializing", 0.03)

    try:
        genome = config.get("genome", "hg38")
        chromosome = config.get("chromosome", "chr21")
        model_type = config.get("model_type", "xgboost")
        requested_features = config.get("features")  # None = all
        model_params = config.get("model_params") or {}
        neg_ratio = config.get("neg_ratio", 3)
        test_fraction = config.get("test_fraction", 0.2)

        if not is_valid(genome, chromosome):
            raise ValueError(f"Unknown genome/chromosome: {genome}/{chromosome}")

        feature_cols = requested_features if requested_features else FEATURE_NAMES

        if requested_features:
            valid = set(FEATURE_NAMES)
            bad = [f for f in requested_features if f not in valid]
            if bad:
                raise ValueError(f"Unknown features: {bad}")

        # ── 1. Load only needed columns from cached Parquet ───────────────────
        stage(f"Loading feature matrix ({len(feature_cols)} cols)", 0.08)
        parquet_path = cache_path(genome, chromosome)
        if not parquet_path.exists():
            raise ValueError(
                f"Feature cache missing for {genome}/{chromosome}. "
                "Trigger extraction via POST /api/genome/{genome}/chromosome/{chrom}/prepare first."
            )
        needed_cols = ["_start", "_end"] + feature_cols
        df = pd.read_parquet(parquet_path, columns=needed_cols)
        stage(f"Loaded {len(df):,} windows", 0.15)

        # ── 2. Extract position arrays now — free them later for export ────────
        starts = df["_start"].values.copy()
        ends = df["_end"].values.copy()

        # ── 3. Label + train ──────────────────────────────────────────────────
        if model_type == "isolation_forest":
            stage("Preparing feature matrix", 0.20)
            X_all = df[feature_cols].values.astype("float32")
            del df
            gc.collect()

            stage("Training Isolation Forest", 0.40)
            model, auc, ap = train_isolation_forest(X_all, model_params)
            n_pos, n_neg = 0, 0
            cv_mean, cv_std = 0.0, 0.0
            fi = {}
            stage("Model trained", 0.70)

        else:
            if not bed_content:
                raise ValueError("BED file required for supervised models")

            stage("Labeling windows from BED", 0.20)
            labels = _parse_bed_labels(bed_content, starts, ends)

            n_total_pos = int(labels.sum())
            if n_total_pos < 10:
                raise ValueError(
                    f"Too few positive windows ({n_total_pos}) after BED labeling. "
                    "Check that your BED file uses the same chromosome as the parquet."
                )

            stage(f"Labeled {n_total_pos:,} positive windows", 0.25)

            # Extract full feature matrix, then immediately free the DataFrame
            X_all = df[feature_cols].values.astype("float32")
            del df
            gc.collect()

            stage(f"Balancing dataset (1:{neg_ratio} pos:neg)", 0.30)
            X_tr, X_te, y_tr, y_te, X_bal, y_bal, n_pos, n_neg = balance_and_split(
                X_all, labels, neg_ratio=neg_ratio, test_fraction=test_fraction,
            )
            del labels
            gc.collect()

            stage(f"Training {model_type} on {n_pos + n_neg:,} samples", 0.40)

            # ── 4. Train ──────────────────────────────────────────────────────
            if model_type == "xgboost":
                model, auc, ap = train_xgboost(X_tr, y_tr, X_te, y_te, model_params)
            else:
                model, auc, ap = train_random_forest(X_tr, y_tr, X_te, y_te, model_params)

            del X_tr, X_te, y_tr, y_te
            gc.collect()
            stage(f"Held-out AUC {auc:.3f} — running 5-fold CV", 0.65)

            # ── 5. Cross-validation ───────────────────────────────────────────
            cv_scores = run_cv(X_bal, y_bal, model_params)
            cv_mean, cv_std = float(cv_scores.mean()), float(cv_scores.std())
            del X_bal, y_bal
            gc.collect()
            stage(f"CV AUC {cv_mean:.3f} ±{cv_std:.3f}", 0.75)

            fi = feature_importance_dict(model, feature_cols)

        # ── 6. Predict on ALL windows ─────────────────────────────────────────
        stage(f"Scoring {len(starts):,} genome windows", 0.82)
        probs = predict_probs(model, X_all)
        del X_all
        gc.collect()
        stage("Generating outputs", 0.90)

        # ── 7. Write output files ─────────────────────────────────────────────
        import joblib
        import json as _json

        job_dir = settings.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        bg_path = job_dir / "predictions.bedGraph"
        bw_path = job_dir / "predictions.bw"
        hc_path = job_dir / "highconf.bed"
        model_path = job_dir / "model.joblib"
        meta_path = job_dir / "model_meta.json"

        write_bedgraph(starts, ends, probs, chromosome, bg_path, track_name=f"job_{job_id[:8]}")
        n_hc = write_highconf_bed(starts, ends, probs, chromosome, hc_path, track_name=f"job_{job_id[:8]}")

        # Build a bigWig alongside the bedGraph so the genome browser can do
        # range queries instead of streaming the entire chromosome as text.
        try:
            chrom_size = int(ends.max())
            bedgraph_to_bigwig(bg_path, bw_path, chromosome, chrom_size)
        except Exception as bw_err:
            # bigWig is an optimisation — log and continue with bedGraph-only.
            stage(f"bigWig conversion skipped: {bw_err}", 0.93)

        joblib.dump(model, model_path)
        with open(meta_path, "w") as f:
            _json.dump({
                "job_id": job_id,
                "model_type": model_type,
                "genome": genome,
                "chromosome": chromosome,
                "feature_cols": feature_cols,
            }, f, indent=2)

        # ── 8. Persist results ────────────────────────────────────────────────
        metrics = {
            "auc": round(float(auc), 4) if auc is not None else None,
            "ap": round(float(ap), 4) if ap is not None else None,
            "cv_auc_mean": round(cv_mean, 4),
            "cv_auc_std": round(cv_std, 4),
            "n_positives": int(n_pos),
            "n_negatives": int(n_neg),
            "n_highconf_regions": n_hc,
        }
        _update_job(r, job_id, {
            "status": "completed",
            "progress": 1.0,
            "stage": f"Done · {n_hc:,} high-confidence regions",
            "metrics": metrics,
            "feature_importance": fi,
        })

    except Exception as exc:
        _update_job(r, job_id, {
            "status": "failed",
            "progress": 0.0,
            "stage": None,
            "error": str(exc),
        })
        raise

    return {"job_id": job_id, "status": "completed"}
