"""
Genome data cache.

Two responsibilities, both keyed under {feature_cache_dir}/{genome}/:
  • Raw FASTA        — {genome}/{chrom}.fa                  (downloaded from UCSC)
  • Windowed parquet — {genome}/{chrom}__w{W}_s{S}.parquet  (52 features)

The FASTA is downloaded by the `prepare_genome` task (the "Prepare data" button).
Feature extraction is window-dependent, so it happens lazily inside the train /
apply jobs via `ensure_feature_parquet`, which extracts from the cached FASTA
(downloading it first if missing).

Progress key in Redis: cache_job:{genome}:{chrom}
"""
from __future__ import annotations

import gzip
import json
import shutil
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable

import redis

from celery_app import celery
from app.config import settings
from app.core.cache_eviction import enforce_cache_cap
from app.core.extraction import extract_to_parquet
from app.core.genomes import is_valid, ucsc_fasta_url

CACHE_PROGRESS_TTL = 3600  # 1h — extraction usually finishes in minutes


def fasta_path(genome: str, chrom: str) -> Path:
    return settings.feature_cache_dir / genome / f"{chrom}.fa"


def windowed_parquet_path(genome: str, chrom: str, window: int, step: int) -> Path:
    return settings.feature_cache_dir / genome / f"{chrom}__w{window}_s{step}.parquet"


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _progress_key(genome: str, chrom: str) -> str:
    return f"cache_job:{genome}:{chrom}"


def _set_progress(r: redis.Redis, key: str, **fields) -> None:
    current = json.loads(r.get(key) or "{}")
    current.update(fields)
    r.setex(key, CACHE_PROGRESS_TTL, json.dumps(current))


def _download_fasta(genome: str, chrom: str, dest: Path) -> None:
    """Download gzipped FASTA from UCSC and decompress to `dest`."""
    url = ucsc_fasta_url(genome, chrom)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".fa.gz", delete=False) as tmp:
        gz_path = Path(tmp.name)
    try:
        with urllib.request.urlopen(url, timeout=300) as resp, open(gz_path, "wb") as out:
            shutil.copyfileobj(resp, out)
        with gzip.open(gz_path, "rb") as gz, open(dest, "wb") as out:
            shutil.copyfileobj(gz, out)
    finally:
        gz_path.unlink(missing_ok=True)


def ensure_fasta(genome: str, chrom: str) -> Path:
    """Return the cached FASTA path, downloading it from UCSC if absent."""
    dest = fasta_path(genome, chrom)
    if not dest.exists():
        _download_fasta(genome, chrom, dest)
        enforce_cache_cap()
    return dest


def ensure_feature_parquet(
    genome: str,
    chrom: str,
    window: int,
    step: int,
    progress: Callable[[float, str], None] | None = None,
) -> Path:
    """
    Return the windowed feature parquet for (genome, chrom, window, step),
    extracting it from the cached FASTA if missing. Downloads the FASTA first
    when it isn't cached yet. Used by both the train and apply jobs.
    """
    parquet = windowed_parquet_path(genome, chrom, window, step)
    if parquet.exists():
        return parquet

    fasta = ensure_fasta(genome, chrom)
    extract_to_parquet(fasta, parquet, window_size=window, step_size=step, progress=progress)
    enforce_cache_cap()
    return parquet


@celery.task(bind=True, name="tasks.prepare_genome")
def prepare_genome(self, genome: str, chrom: str) -> dict:
    """Download (and cache) the chromosome FASTA. No feature extraction —
    that is window-dependent and happens inside the train/apply jobs."""
    if not is_valid(genome, chrom):
        raise ValueError(f"Unknown (genome, chromosome): {genome}/{chrom}")

    r = _redis()
    pkey = _progress_key(genome, chrom)
    fasta = fasta_path(genome, chrom)

    if fasta.exists():
        _set_progress(r, pkey, status="completed", progress=1.0, stage="Already cached")
        return {"genome": genome, "chrom": chrom, "cached": True}

    _set_progress(r, pkey, status="running", progress=0.1,
                  stage=f"Fetching {chrom}.fa.gz from UCSC")
    try:
        _download_fasta(genome, chrom, fasta)
        enforce_cache_cap()
        _set_progress(r, pkey, status="completed", progress=1.0, stage="Genome data ready")
        return {"genome": genome, "chrom": chrom, "cached": False}
    except Exception as exc:
        _set_progress(r, pkey, status="failed", progress=0.0, stage=None, error=str(exc))
        fasta.unlink(missing_ok=True)
        raise
