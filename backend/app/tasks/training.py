"""
Celery training task.

Flow:
  1. Load pre-computed feature matrix (Parquet)
  2. Parse uploaded BED file → label windows
  3. Balance dataset + train/test split
  4. Train model (XGBoost / RF / IsoForest) + 5-fold CV
  5. Predict on all 200k windows
  6. Write bedGraph + high-conf BED to disk
  7. Persist metrics in Redis
  8. Update job status
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import redis

from celery_app import celery
from app.config import settings
from app.core.features import FEATURE_NAMES
from app.core.models import (
    train_xgboost, train_random_forest, train_isolation_forest,
    run_cv, balance_and_split, feature_importance_dict,
)
from app.core.export import predict_probs, write_bedgraph, write_highconf_bed


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _update_job(r: redis.Redis, job_id: str, updates: dict) -> None:
    key = f"job:{job_id}"
    current = json.loads(r.get(key) or "{}")
    current.update(updates)
    r.setex(key, settings.job_ttl_seconds, json.dumps(current))


def _parse_bed_labels(bed_content: str, df: pd.DataFrame) -> pd.Series:
    """
    Parse BED file content and label each window.
    A window is positive if it overlaps any BED region.
    Returns a Series of 0/1 aligned to df index.
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

    # Build interval membership using vectorised ops
    starts = df["_start"].values
    ends = df["_end"].values
    labels = np.zeros(len(df), dtype=np.int32)

    for bed_s, bed_e in positive_intervals:
        # Window overlaps region if window_start < bed_end AND window_end > bed_start
        overlap = (starts < bed_e) & (ends > bed_s)
        labels |= overlap.astype(np.int32)

    return pd.Series(labels, index=df.index, name="_label")


@celery.task(bind=True, name="tasks.train_model")
def train_model(
    self,
    job_id: str,
    bed_content: str | None,  # None for IsolationForest
    config: dict,
) -> dict:
    r = _redis()
    _update_job(r, job_id, {"status": "running", "progress": 0.05})

    try:
        chromosome = config.get("chromosome", "chr21")
        model_type = config.get("model_type", "xgboost")
        requested_features = config.get("features")  # None = all
        model_params = config.get("model_params") or {}
        neg_ratio = config.get("neg_ratio", 3)
        test_fraction = config.get("test_fraction", 0.2)

        # ── 1. Load feature matrix ────────────────────────────────────────────
        parquet_path = settings.parquet_dir / "features_master.parquet"
        df = pd.read_parquet(parquet_path)
        _update_job(r, job_id, {"progress": 0.15})

        # ── 2. Resolve feature columns ────────────────────────────────────────
        if requested_features:
            # Validate each name exists
            valid = set(FEATURE_NAMES)
            bad = [f for f in requested_features if f not in valid]
            if bad:
                raise ValueError(f"Unknown features: {bad}")
            feature_cols = requested_features
        else:
            feature_cols = FEATURE_NAMES

        # ── 3. Label windows from BED (skip for IsoForest) ───────────────────
        if model_type == "isolation_forest":
            X_all = df[feature_cols].values.astype("float32")
            model, auc, ap = train_isolation_forest(X_all, model_params)
            n_pos, n_neg = 0, 0
            cv_mean, cv_std = 0.0, 0.0
            fi = {}
        else:
            if not bed_content:
                raise ValueError("BED file required for supervised models")

            labels = _parse_bed_labels(bed_content, df)
            df = df.copy()
            df["_label"] = labels

            n_total_pos = int(labels.sum())
            if n_total_pos < 50:
                raise ValueError(
                    f"Too few positive windows ({n_total_pos}) after BED labeling. "
                    "Check that your BED file uses the same chromosome as the parquet."
                )

            _update_job(r, job_id, {"progress": 0.25})

            # ── 4. Balance + split ────────────────────────────────────────────
            X_tr, X_te, y_tr, y_te, X_all, y_all, n_pos, n_neg = balance_and_split(
                df, feature_cols, neg_ratio=neg_ratio, test_fraction=test_fraction,
            )
            _update_job(r, job_id, {"progress": 0.35})

            # ── 5. Train ──────────────────────────────────────────────────────
            if model_type == "xgboost":
                model, auc, ap = train_xgboost(X_tr, y_tr, X_te, y_te, model_params)
            else:
                model, auc, ap = train_random_forest(X_tr, y_tr, X_te, y_te, model_params)

            _update_job(r, job_id, {"progress": 0.65})

            # ── 6. Cross-validation ───────────────────────────────────────────
            cv_scores = run_cv(X_all, y_all, model_params)
            cv_mean, cv_std = float(cv_scores.mean()), float(cv_scores.std())
            _update_job(r, job_id, {"progress": 0.75})

            fi = feature_importance_dict(model, feature_cols)

        # ── 7. Predict on ALL windows ─────────────────────────────────────────
        probs = predict_probs(model, df, feature_cols)
        _update_job(r, job_id, {"progress": 0.85})

        # ── 8. Write output files ─────────────────────────────────────────────
        job_dir = settings.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        bg_path = job_dir / "predictions.bedGraph"
        hc_path = job_dir / "highconf.bed"

        write_bedgraph(df, probs, chromosome, bg_path, track_name=f"job_{job_id[:8]}")
        n_hc = write_highconf_bed(df, probs, chromosome, hc_path, track_name=f"job_{job_id[:8]}")

        # ── 9. Persist results ────────────────────────────────────────────────
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
            "metrics": metrics,
            "feature_importance": fi,
        })

    except Exception as exc:
        _update_job(r, job_id, {
            "status": "failed",
            "progress": 0.0,
            "error": str(exc),
        })
        raise

    return {"job_id": job_id, "status": "completed"}
