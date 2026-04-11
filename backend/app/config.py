from pathlib import Path
from pydantic_settings import BaseSettings

_REPO_ROOT = Path(__file__).parent.parent.parent


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379/0"
    parquet_dir: Path = _REPO_ROOT / "phase0d_multi"
    jobs_dir: Path = _REPO_ROOT / "data" / "jobs"
    job_ttl_seconds: int = 86400  # 24 h

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
settings.jobs_dir.mkdir(parents=True, exist_ok=True)
