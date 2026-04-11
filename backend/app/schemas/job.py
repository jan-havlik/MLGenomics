from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class JobMetrics(BaseModel):
    auc: Optional[float] = None
    ap: Optional[float] = None
    cv_auc_mean: float = 0.0
    cv_auc_std: float = 0.0
    n_positives: int = 0
    n_negatives: int = 0
    n_highconf_regions: int = 0


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending | running | completed | failed
    progress: float  # 0.0 – 1.0
    model_type: str
    chromosome: str
    created_at: datetime
    metrics: Optional[JobMetrics] = None
    feature_importance: Optional[dict[str, float]] = None
    error: Optional[str] = None


class JobListItem(BaseModel):
    job_id: str
    status: str
    model_type: str
    chromosome: str
    created_at: datetime
    auc: Optional[float] = None
