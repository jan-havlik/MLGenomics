from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, field_validator


class TrainRequest(BaseModel):
    genome: str = "hg38"
    chromosome: str = "chr21"
    # Feature window in bp — derived per-job from the uploaded BED region widths.
    window_size: int = 200
    step_size: Optional[int] = None  # None → non-overlapping (= window_size)
    # "curated" → the 52 hand-crafted features; "kmer" → the raw 4^k spectrum.
    feature_set: str = "curated"
    k: Optional[int] = None  # k-mer size; used (and defaulted to 6) when feature_set="kmer"
    features: Optional[list[str]] = None  # None → use all features in the set
    model_params: Optional[dict] = None
    neg_ratio: int = 3
    test_fraction: float = 0.2

    @field_validator("window_size")
    @classmethod
    def validate_window(cls, v: int) -> int:
        if v < 10:
            raise ValueError("window_size must be >= 10 bp")
        return v

    @field_validator("feature_set")
    @classmethod
    def validate_feature_set(cls, v: str) -> str:
        if v not in ("curated", "kmer"):
            raise ValueError("feature_set must be 'curated' or 'kmer'")
        return v

    @field_validator("k")
    @classmethod
    def validate_k(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not 1 <= v <= 6:
            raise ValueError("k must be between 1 and 6")
        return v


class FeatureInfoSchema(BaseModel):
    name: str
    group: str
    description: str


class ChromosomeInfo(BaseModel):
    name: str
    cached: bool
    n_windows: Optional[int] = None


class GenomeInfoSchema(BaseModel):
    id: str
    display_name: str
    species: str
    chromosomes: list[str]


class CachePrepareResponse(BaseModel):
    task_id: str
    genome: str
    chromosome: str


class CacheStatus(BaseModel):
    genome: str
    chromosome: str
    cached: bool
    status: Optional[str] = None  # running | completed | failed | None
    progress: Optional[float] = None
    stage: Optional[str] = None
    error: Optional[str] = None
    n_windows: Optional[int] = None
