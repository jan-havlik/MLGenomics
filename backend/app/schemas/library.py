from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LibraryModelInfo(BaseModel):
    name: str
    display_name: str
    description: str = ""
    model_type: str
    chromosome: str
    auc: Optional[float] = None
    ap: Optional[float] = None
    n_features: int
    feature_cols: list[str]
    tags: list[str] = []
    created_at: datetime


class SaveToLibraryRequest(BaseModel):
    name: str
    display_name: str
    description: str = ""
    tags: list[str] = []


class PatchLibraryRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
