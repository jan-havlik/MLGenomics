from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379/0"
    parquet_dir: Path = Path("/data")
    jobs_dir: Path = Path("/data/jobs")
    library_dir: Path = Path("/data/library")
    job_ttl_seconds: int = 86400  # 24 h

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
settings.library_dir.mkdir(parents=True, exist_ok=True)
