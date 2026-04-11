from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, field_validator


class TrainRequest(BaseModel):
    chromosome: str = "chr21"
    model_type: str = "xgboost"  # xgboost | random_forest | isolation_forest
    features: Optional[list[str]] = None  # None → use all 52
    model_params: Optional[dict] = None
    neg_ratio: int = 3
    test_fraction: float = 0.2

    @field_validator("model_type")
    @classmethod
    def validate_model(cls, v: str) -> str:
        allowed = {"xgboost", "random_forest", "isolation_forest"}
        if v not in allowed:
            raise ValueError(f"model_type must be one of {allowed}")
        return v

    @field_validator("chromosome")
    @classmethod
    def validate_chrom(cls, v: str) -> str:
        allowed = {"chr21"}
        if v not in allowed:
            raise ValueError(f"chromosome must be one of {allowed}")
        return v


class FeatureInfoSchema(BaseModel):
    name: str
    group: str
    description: str


class ChromosomeInfo(BaseModel):
    name: str
    parquet_available: bool
    n_windows: Optional[int] = None
