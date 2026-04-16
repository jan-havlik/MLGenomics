"""
ML model training functions adapted from phase0d_multi_feature.py.
Supports XGBoost, Random Forest, and Isolation Forest.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.metrics import roc_auc_score, average_precision_score
from xgboost import XGBClassifier

RANDOM_STATE = 42


def train_xgboost(
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_te: np.ndarray,
    y_te: np.ndarray,
    params: dict | None = None,
) -> tuple:
    defaults = dict(
        n_estimators=500, max_depth=8, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.7, min_child_weight=3,
        reg_alpha=0.1, reg_lambda=1.0,
        random_state=RANDOM_STATE, eval_metric="logloss",
    )
    if params:
        defaults.update(params)
    model = XGBClassifier(**defaults)
    model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
    probs = model.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, probs)
    ap = average_precision_score(y_te, probs)
    return model, auc, ap


def train_random_forest(
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    X_te: np.ndarray,
    y_te: np.ndarray,
    params: dict | None = None,
) -> tuple:
    defaults = dict(
        n_estimators=500, max_depth=12, min_samples_leaf=3,
        random_state=RANDOM_STATE, n_jobs=1,
    )
    if params:
        defaults.update(params)
    model = RandomForestClassifier(**defaults)
    model.fit(X_tr, y_tr)
    probs = model.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, probs)
    ap = average_precision_score(y_te, probs)
    return model, auc, ap


def train_isolation_forest(
    X_all: np.ndarray,
    params: dict | None = None,
) -> tuple:
    """
    Unsupervised anomaly detection — no labels required.
    Returns (model, None, None) so the caller gets consistent shape.
    """
    _ISOFOREST_PARAMS = {"n_estimators", "contamination", "max_samples",
                         "max_features", "bootstrap", "random_state", "n_jobs"}
    defaults = dict(
        n_estimators=500, contamination=0.1,
        random_state=RANDOM_STATE, n_jobs=1,
    )
    if params:
        defaults.update({k: v for k, v in params.items() if k in _ISOFOREST_PARAMS})
    model = IsolationForest(**defaults)
    model.fit(X_all)
    return model, None, None


def run_cv(X: np.ndarray, y: np.ndarray, params: dict | None = None) -> np.ndarray:
    cv_params = dict(
        n_estimators=300, max_depth=8, learning_rate=0.05,
        random_state=RANDOM_STATE, eval_metric="logloss",
    )
    if params:
        cv_params.update({k: v for k, v in params.items()
                          if k in ("n_estimators", "max_depth", "learning_rate")})
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    scores = cross_val_score(
        XGBClassifier(**cv_params), X, y,
        cv=cv, scoring="roc_auc", n_jobs=1,
    )
    return scores


def balance_and_split(
    df: pd.DataFrame,
    feature_cols: list[str],
    neg_ratio: int = 3,
    test_fraction: float = 0.2,
) -> tuple:
    """Balance classes and create train/test split."""
    pos = df[df["_label"] == 1]
    neg = df[df["_label"] == 0]

    n_neg = min(len(neg), len(pos) * neg_ratio)
    neg_s = neg.sample(n=n_neg, random_state=RANDOM_STATE)
    bal = pd.concat([pos, neg_s]).sample(frac=1, random_state=RANDOM_STATE)

    X = bal[feature_cols].values.astype(np.float32)
    y = bal["_label"].values.astype(np.int32)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=test_fraction, random_state=RANDOM_STATE, stratify=y,
    )
    return X_tr, X_te, y_tr, y_te, X, y, len(pos), n_neg


def feature_importance_dict(model, feature_cols: list[str]) -> dict[str, float]:
    """Extract normalised feature importances (works for XGBoost and RF)."""
    if hasattr(model, "feature_importances_"):
        raw = model.feature_importances_
        total = raw.sum() or 1.0
        return {col: float(raw[i] / total) for i, col in enumerate(feature_cols)}
    return {}
