from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LibraryModelInfo(BaseModel):
    name: str
    display_name: str
    description: str = ""
    model_type: str
    genome: str = "hg38"
    chromosome: str
    window_size: int = 200
    auc: Optional[float] = None
    ap: Optional[float] = None
    n_features: int
    feature_cols: list[str]
    tags: list[str] = []
    created_at: datetime


class PredictRequest(BaseModel):
    """Target genome/chromosome to apply a saved model to (no labels needed)."""
    genome: str
    chromosome: str


class SaveToLibraryRequest(BaseModel):
    name: str
    display_name: str
    description: str = ""
    tags: list[str] = []


class PatchLibraryRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
