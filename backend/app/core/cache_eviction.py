"""
Disk-bounded LRU eviction for the per-genome feature cache.

The cache directory is a flat layout of small parquet files
(`{cache_dir}/{genome}/{chrom}.parquet`). Eviction picks the oldest by mtime
until total size is under `cache_max_bytes`.
"""
from __future__ import annotations

from pathlib import Path

from app.config import settings


def _walk_parquets(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [p for p in root.glob("*/*.parquet") if p.is_file()]


def cache_size_bytes() -> int:
    return sum(p.stat().st_size for p in _walk_parquets(settings.feature_cache_dir))


def enforce_cache_cap() -> int:
    """Evict oldest parquets until cache total <= settings.cache_max_bytes.
    Returns the number of files evicted."""
    cap = settings.cache_max_bytes
    parquets = _walk_parquets(settings.feature_cache_dir)
    total = sum(p.stat().st_size for p in parquets)
    if total <= cap:
        return 0

    # Sort oldest first (LRU by modification time).
    parquets.sort(key=lambda p: p.stat().st_mtime)
    evicted = 0
    for p in parquets:
        if total <= cap:
            break
        size = p.stat().st_size
        try:
            p.unlink()
            total -= size
            evicted += 1
        except OSError:
            continue
    return evicted
