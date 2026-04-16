from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379/0"
    # Read-only assets baked into the image (feature matrix, etc.)
    parquet_dir: Path = Path("/app/data")
    # Writable state — backed by a persistent volume in production
    jobs_dir: Path = Path("/var/data/jobs")
    library_dir: Path = Path("/var/data/library")
    job_ttl_seconds: int = 86400  # 24 h

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
settings.library_dir.mkdir(parents=True, exist_ok=True)
