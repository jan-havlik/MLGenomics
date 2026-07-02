"""
Disk-bounded LRU eviction for the per-genome cache.

The cache directory holds raw FASTAs and windowed feature parquets
(`{cache_dir}/{genome}/{chrom}.fa`, `{chrom}__w{W}_s{S}.parquet`). Eviction
picks the oldest by mtime until total size is under `cache_max_bytes`.
"""
from __future__ import annotations

from pathlib import Path

from app.config import settings


def _walk_cache(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [
        p for p in root.glob("*/*")
        if p.is_file() and p.suffix in (".fa", ".parquet")
    ]


def cache_size_bytes() -> int:
    return sum(p.stat().st_size for p in _walk_cache(settings.feature_cache_dir))


def enforce_cache_cap() -> int:
    """Evict oldest cache files until total <= settings.cache_max_bytes.
    Returns the number of files evicted."""
    cap = settings.cache_max_bytes
    files = _walk_cache(settings.feature_cache_dir)
    total = sum(p.stat().st_size for p in files)
    if total <= cap:
        return 0

    # Sort oldest first (LRU by modification time).
    files.sort(key=lambda p: p.stat().st_mtime)
    evicted = 0
    for p in files:
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
