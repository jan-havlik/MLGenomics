from fastapi import APIRouter
from app.core.features import FEATURE_CATALOG, FEATURE_GROUPS
from app.schemas.training import FeatureInfoSchema, ChromosomeInfo
from app.config import settings

router = APIRouter(prefix="/api", tags=["features"])

_PARQUET_MAP = {
    "chr21": settings.parquet_dir / "features_master.parquet",
}


@router.get("/features", response_model=list[FeatureInfoSchema])
def list_features():
    return [
        FeatureInfoSchema(name=f.name, group=f.group, description=f.description)
        for f in FEATURE_CATALOG
    ]


@router.get("/chromosomes", response_model=list[ChromosomeInfo])
def list_chromosomes():
    result = []
    for chrom, path in _PARQUET_MAP.items():
        n_windows = None
        if path.exists():
            import pandas as pd
            meta = pd.read_parquet(path, columns=["_start"])
            n_windows = len(meta)
        result.append(ChromosomeInfo(
            name=chrom,
            parquet_available=path.exists(),
            n_windows=n_windows,
        ))
    return result
