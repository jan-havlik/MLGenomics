import shutil
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379/0"
    # Read-only assets baked into the image (feature matrix, etc.)
    parquet_dir: Path = Path("/app/data")
    # Writable state — backed by a persistent volume in production
    jobs_dir: Path = Path("/var/data/jobs")
    library_dir: Path = Path("/var/data/library")
    feature_cache_dir: Path = Path("/var/data/cache")
    job_ttl_seconds: int = 86400  # 24 h

    # Comma-separated origins allowed by CORS. Empty default = nothing allowed.
    allowed_origins: str = ""
    # Hard cap on uploaded BED files (50 MB default — Caddy enforces a similar cap upstream).
    max_bed_bytes: int = 50_000_000
    # Soft cap for the per-genome feature cache (~4 GB default).
    cache_max_bytes: int = 4_000_000_000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
settings.library_dir.mkdir(parents=True, exist_ok=True)
settings.feature_cache_dir.mkdir(parents=True, exist_ok=True)


def _migrate_legacy_chr21_parquet() -> None:
    """The pre-multigenome build shipped a single chr21 parquet at
    {parquet_dir}/features_master.parquet. Move it into the cache layout
    so existing deployments don't need to re-fetch chr21 from UCSC."""
    legacy = settings.parquet_dir / "features_master.parquet"
    target = settings.feature_cache_dir / "hg38" / "chr21.parquet"
    if legacy.exists() and not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy, target)


_migrate_legacy_chr21_parquet()
