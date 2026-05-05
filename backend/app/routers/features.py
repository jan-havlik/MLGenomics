import json

import redis
from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.core.cache_eviction import cache_size_bytes
from app.core.features import FEATURE_CATALOG
from app.core.genomes import GENOMES, DEFAULT_GENOME, is_valid
from app.core.rate_limit import rate_limit
from app.schemas.training import (
    CachePrepareResponse,
    CacheStatus,
    ChromosomeInfo,
    FeatureInfoSchema,
    GenomeInfoSchema,
)
from app.tasks.extraction import (
    cache_path,
    extract_chromosome_features,
)

router = APIRouter(prefix="/api", tags=["features"])


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _progress_key(genome: str, chromosome: str) -> str:
    return f"cache_job:{genome}:{chromosome}"


@router.get("/features", response_model=list[FeatureInfoSchema])
def list_features():
    return [
        FeatureInfoSchema(name=f.name, group=f.group, description=f.description)
        for f in FEATURE_CATALOG
    ]


@router.get("/genomes", response_model=list[GenomeInfoSchema])
def list_genomes():
    return [
        GenomeInfoSchema(
            id=key,
            display_name=info.display_name,
            species=info.species,
            chromosomes=info.chromosomes,
        )
        for key, info in GENOMES.items()
    ]


@router.get("/chromosomes", response_model=list[ChromosomeInfo])
def list_chromosomes(genome: str = DEFAULT_GENOME):
    info = GENOMES.get(genome)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Unknown genome: {genome}")
    return [
        ChromosomeInfo(name=chrom, cached=cache_path(genome, chrom).exists())
        for chrom in info.chromosomes
    ]


@router.get(
    "/genome/{genome}/chromosome/{chromosome}/status",
    response_model=CacheStatus,
)
def cache_status(genome: str, chromosome: str):
    if not is_valid(genome, chromosome):
        raise HTTPException(status_code=404, detail=f"Unknown genome/chromosome: {genome}/{chromosome}")

    cached = cache_path(genome, chromosome).exists()
    raw = _redis().get(_progress_key(genome, chromosome))
    job = json.loads(raw) if raw else {}
    return CacheStatus(
        genome=genome,
        chromosome=chromosome,
        cached=cached,
        status=job.get("status"),
        progress=job.get("progress"),
        stage=job.get("stage"),
        error=job.get("error"),
        n_windows=job.get("n_windows"),
    )


@router.get("/cache/usage")
def cache_usage():
    used = cache_size_bytes()
    cap = settings.cache_max_bytes
    return {
        "used_bytes": used,
        "max_bytes": cap,
        "fraction": used / cap if cap else 0.0,
    }


@router.post(
    "/genome/{genome}/chromosome/{chromosome}/prepare",
    response_model=CachePrepareResponse,
    dependencies=[Depends(rate_limit("prepare", 5))],
)
def prepare_cache(genome: str, chromosome: str):
    if not is_valid(genome, chromosome):
        raise HTTPException(status_code=404, detail=f"Unknown genome/chromosome: {genome}/{chromosome}")

    async_result = extract_chromosome_features.delay(genome, chromosome)
    return CachePrepareResponse(
        task_id=async_result.id,
        genome=genome,
        chromosome=chromosome,
    )
