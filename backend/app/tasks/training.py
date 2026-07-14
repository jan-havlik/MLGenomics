"""
Celery training task.

Flow:
  1. Extract the feature matrix at the job's window size (cached per window)
  2. Extract position arrays (start/end) for export
  3. Parse uploaded BED file → label windows
  4. Balance dataset + train/test split
  5. Train XGBoost + 5-fold CV
  6. Predict on all windows
  7. Write bedGraph + high-conf BED to disk
  8. Persist metrics + model (with its window size) in Redis / on disk
  9. Update job status
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
from app.core.extraction import kmer_feature_names
from app.core.features import FEATURE_NAMES
from app.core.genomes import is_valid
from app.core.models import (
    train_xgboost, run_cv, balance_and_split, feature_importance_dict,
    threshold_metrics,
)
from app.core.export import bedgraph_to_bigwig, predict_probs, write_bedgraph, write_highconf_bed
from app.tasks.extraction import ensure_feature_parquet


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
    bed_content: str,
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
        requested_features = config.get("features")  # None = all
        model_params = config.get("model_params") or {}
        neg_ratio = config.get("neg_ratio", 3)
        test_fraction = config.get("test_fraction", 0.2)
        window_size = int(config.get("window_size") or 200)
        step_size = int(config.get("step_size") or window_size)
        feature_set = config.get("feature_set") or "curated"
        k = config.get("k")

        if not is_valid(genome, chromosome):
            raise ValueError(f"Unknown genome/chromosome: {genome}/{chromosome}")
        if window_size < 10:
            raise ValueError(f"window_size must be >= 10 (got {window_size})")

        if not bed_content:
            raise ValueError("BED file with positive labels is required")

        # Available columns depend on the feature set: the 52 curated features,
        # or the raw 4^k k-mer spectrum (k defaults to 6 — the usual sweet spot).
        if feature_set == "kmer":
            k = int(k) if k else 6
            available = kmer_feature_names(k)
        else:
            k = None
            available = FEATURE_NAMES
        feature_cols = requested_features if requested_features else available
        if requested_features:
            bad = [f for f in requested_features if f not in set(available)]
            if bad:
                raise ValueError(f"Unknown features: {bad}")

        # ── 1. Extract features at the requested window (cached per window) ────
        def extract_progress(frac: float, msg: str) -> None:
            stage(msg, 0.08 + 0.24 * frac)  # map extractor 0..1 → 0.08..0.32

        stage(f"Preparing {chromosome} features at {window_size} bp windows", 0.08)
        parquet_path = ensure_feature_parquet(
            genome, chromosome, window_size, step_size, progress=extract_progress,
            feature_set=feature_set, k=k,
        )
        needed_cols = ["_start", "_end"] + feature_cols
        df = pd.read_parquet(parquet_path, columns=needed_cols)
        stage(f"Loaded {len(df):,} windows", 0.34)

        # ── 2. Position arrays (kept for export after the DataFrame is freed) ──
        starts = df["_start"].values.copy()
        ends = df["_end"].values.copy()

        # ── 3. Label windows from BED ─────────────────────────────────────────
        stage("Labeling windows from BED", 0.36)
        labels = _parse_bed_labels(bed_content, starts, ends)

        n_total_pos = int(labels.sum())
        if n_total_pos < 10:
            raise ValueError(
                f"Too few positive windows ({n_total_pos}) after BED labeling. "
                "Check that your BED file uses the same chromosome as the training data, "
                "and that the window size is appropriate for your region widths."
            )

        # Guard against degenerate labeling: if positives are the majority of
        # windows there's no background to contrast against — the model just
        # learns "say positive" and scores everything ~1.0. Usually caused by a
        # feature window much larger than the BED regions (each small region
        # claims a whole window) or a BED that covers most of the chromosome.
        pos_fraction = n_total_pos / len(starts)
        if pos_fraction >= 0.5:
            raise ValueError(
                f"BED labels {pos_fraction * 100:.0f}% of the {len(starts):,} windows positive — "
                f"too few negatives remain to train a discriminative model (positives must be the "
                f"minority). The {window_size} bp feature window is likely much larger than your BED "
                f"regions, or the BED covers most of the chromosome. Try a smaller feature window or a "
                f"more specific BED."
            )
        stage(f"Labeled {n_total_pos:,} positive windows ({pos_fraction * 100:.0f}%)", 0.40)

        X_all = df[feature_cols].values.astype("float32")
        del df
        gc.collect()

        # ── 4. Balance + split ────────────────────────────────────────────────
        stage(f"Balancing dataset (1:{neg_ratio} pos:neg)", 0.44)
        X_tr, X_te, y_tr, y_te, X_bal, y_bal, n_pos, n_neg = balance_and_split(
            X_all, labels, neg_ratio=neg_ratio, test_fraction=test_fraction,
        )
        del labels
        gc.collect()

        # ── 5. Train XGBoost ──────────────────────────────────────────────────
        stage(f"Training XGBoost on {n_pos + n_neg:,} samples", 0.52)
        model, auc, ap = train_xgboost(X_tr, y_tr, X_te, y_te, model_params)
        # Operating-point metrics on the held-out test set (0.5 cutoff).
        thr = threshold_metrics(y_te, predict_probs(model, X_te), 0.5)
        del X_tr, X_te, y_tr, y_te
        gc.collect()
        stage(f"Held-out AUC {auc:.3f} — running 5-fold CV", 0.66)

        cv_scores = run_cv(X_bal, y_bal, model_params)
        cv_mean, cv_std = float(cv_scores.mean()), float(cv_scores.std())
        del X_bal, y_bal
        gc.collect()
        stage(f"CV AUC {cv_mean:.3f} ±{cv_std:.3f}", 0.76)

        fi = feature_importance_dict(model, feature_cols)
        # The k-mer spectrum can be 4096 columns — keep only the top ranks so the
        # payload stays small and the "which k-mers mattered" readout is usable.
        if feature_set == "kmer" and len(fi) > 50:
            fi = dict(sorted(fi.items(), key=lambda kv: kv[1], reverse=True)[:50])

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
                "model_type": "xgboost",
                "genome": genome,
                "chromosome": chromosome,
                "feature_set": feature_set,
                "k": k,
                "feature_cols": feature_cols,
                "window_size": window_size,
                "step_size": step_size,
            }, f, indent=2)

        # ── 8. Persist results ────────────────────────────────────────────────
        n_windows_total = int(len(starts))
        metrics = {
            "auc": round(float(auc), 4) if auc is not None else None,
            "ap": round(float(ap), 4) if ap is not None else None,
            "cv_auc_mean": round(cv_mean, 4),
            "cv_auc_std": round(cv_std, 4),
            "precision": round(thr["precision"], 4),
            "recall": round(thr["recall"], 4),
            "f1": round(thr["f1"], 4),
            "specificity": round(thr["specificity"], 4),
            "n_positives": int(n_pos),
            "n_negatives": int(n_neg),
            "n_highconf_regions": n_hc,
            "n_windows_total": n_windows_total,
            "flagged_fraction": round(n_hc / n_windows_total, 6) if n_windows_total else 0.0,
            "flagged_bp": int(n_hc) * int(window_size),
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
