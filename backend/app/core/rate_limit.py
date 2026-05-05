"""
Tiny Redis-backed rate limiter — per-IP counter with a sliding 1-minute window.

Used to keep accidental traffic spikes (or a curious script) from filling
the disk via /prepare or saturating the Celery queue via /jobs.
"""
from __future__ import annotations

import redis
from fastapi import HTTPException, Request

from app.config import settings


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, max_per_minute: int):
    """FastAPI dependency factory: use as `Depends(rate_limit("prepare", 5))`."""
    def _check(request: Request) -> None:
        ip = _client_ip(request)
        key = f"rate:{bucket}:{ip}"
        r = _redis()
        # Pipeline keeps INCR+EXPIRE atomic; otherwise a process crash between them
        # could leave a counter without a TTL and lock out the IP forever.
        with r.pipeline() as p:
            p.incr(key)
            p.expire(key, 60)
            count, _ = p.execute()
        if count > max_per_minute:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({max_per_minute}/min for {bucket})",
            )
    return _check
