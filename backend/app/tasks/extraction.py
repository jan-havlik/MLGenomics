"""
Celery task: fetch a chromosome FASTA from UCSC goldenPath, extract the 52
features into a parquet, and cache the result on disk.

Cache key: {feature_cache_dir}/{genome}/{chrom}.parquet
Progress key in Redis: cache_job:{genome}:{chrom}
"""
from __future__ import annotations

import gzip
import json
import shutil
import tempfile
import urllib.request
from pathlib import Path

import redis

from celery_app import celery
from app.config import settings
from app.core.cache_eviction import enforce_cache_cap
from app.core.extraction import extract_to_parquet
from app.core.genomes import is_valid, ucsc_fasta_url

CACHE_PROGRESS_TTL = 3600  # 1h — extraction usually finishes in minutes


def cache_path(genome: str, chrom: str) -> Path:
    return settings.feature_cache_dir / genome / f"{chrom}.parquet"


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
    with tempfile.NamedTemporaryFile(suffix=".fa.gz", delete=False) as tmp:
        gz_path = Path(tmp.name)
    try:
        with urllib.request.urlopen(url, timeout=300) as resp, open(gz_path, "wb") as out:
            shutil.copyfileobj(resp, out)
        with gzip.open(gz_path, "rb") as gz, open(dest, "wb") as out:
            shutil.copyfileobj(gz, out)
    finally:
        gz_path.unlink(missing_ok=True)


@celery.task(bind=True, name="tasks.extract_chromosome_features")
def extract_chromosome_features(self, genome: str, chrom: str) -> dict:
    if not is_valid(genome, chrom):
        raise ValueError(f"Unknown (genome, chromosome): {genome}/{chrom}")

    r = _redis()
    pkey = _progress_key(genome, chrom)
    parquet = cache_path(genome, chrom)

    if parquet.exists():
        _set_progress(r, pkey, status="completed", progress=1.0,
                      stage="Already cached", n_windows=None)
        return {"genome": genome, "chrom": chrom, "cached": True}

    _set_progress(r, pkey, status="running", progress=0.0,
                  stage=f"Fetching {chrom}.fa.gz from UCSC")

    fasta_tmp = settings.feature_cache_dir / f"_tmp_{genome}_{chrom}.fa"
    try:
        _download_fasta(genome, chrom, fasta_tmp)

        def progress(frac: float, msg: str) -> None:
            # Map extractor's 0..1 onto 0.10..0.98 so download+write get the rest.
            scaled = 0.10 + 0.88 * frac
            _set_progress(r, pkey, status="running", progress=scaled, stage=msg)

        n = extract_to_parquet(fasta_tmp, parquet, progress=progress)
        enforce_cache_cap()

        _set_progress(r, pkey, status="completed", progress=1.0,
                      stage=f"Cached {n:,} windows", n_windows=n)
        return {"genome": genome, "chrom": chrom, "cached": False, "n_windows": n}

    except Exception as exc:
        _set_progress(r, pkey, status="failed", progress=0.0,
                      stage=None, error=str(exc))
        # Make sure we don't leave a half-written parquet behind.
        parquet.unlink(missing_ok=True)
        raise
    finally:
        fasta_tmp.unlink(missing_ok=True)
