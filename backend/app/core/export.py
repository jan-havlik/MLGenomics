"""
BedGraph + BED export functions adapted from phase0d_multi_feature.py:export_predictions().
"""
from __future__ import annotations
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest


def write_bedgraph(
    starts: np.ndarray,
    ends: np.ndarray,
    probs: np.ndarray,
    chrom: str,
    out_path: Path,
    track_name: str = "predictions",
) -> None:
    """Write UCSC bedGraph format with per-window probability scores."""
    with open(out_path, "w") as fh:
        fh.write(
            f'track type=bedGraph name="{track_name}" '
            f'description="{track_name} prediction probability" '
            f'visibility=full\n'
        )
        for i in range(len(starts)):
            fh.write(f"{chrom}\t{int(starts[i])}\t{int(ends[i])}\t{probs[i]:.4f}\n")


def write_highconf_bed(
    starts: np.ndarray,
    ends: np.ndarray,
    probs: np.ndarray,
    chrom: str,
    out_path: Path,
    track_name: str = "predictions",
    threshold: float = 0.5,
) -> int:
    """Write BED6 for windows with probability >= threshold. Returns region count."""
    high = np.where(probs >= threshold)[0]
    with open(out_path, "w") as fh:
        for i in high:
            score = int(probs[i] * 1000)
            fh.write(f"{chrom}\t{int(starts[i])}\t{int(ends[i])}\t{track_name}\t{score}\t.\n")
    return len(high)


def bedgraph_to_bigwig(
    bedgraph_path: Path,
    bigwig_path: Path,
    chrom: str,
    chrom_size: int,
) -> None:
    """
    Convert a single-chromosome bedGraph to bigWig via UCSC's bedGraphToBigWig.
    Requires the binary to be on PATH (installed in the Dockerfile).

    bedGraphToBigWig refuses tracks with the `track ...` header line, so we
    strip it into a temp file before invoking the binary.
    """
    binary = shutil.which("bedGraphToBigWig")
    if binary is None:
        raise RuntimeError("bedGraphToBigWig binary not found on PATH")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".bg", delete=False) as bg_tmp:
        with open(bedgraph_path) as src:
            for line in src:
                if line.startswith("track") or line.startswith("#") or line.startswith("browser"):
                    continue
                bg_tmp.write(line)
        bg_clean = Path(bg_tmp.name)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".sizes", delete=False) as sz_tmp:
        sz_tmp.write(f"{chrom}\t{chrom_size}\n")
        sizes_path = Path(sz_tmp.name)

    try:
        subprocess.run(
            [binary, str(bg_clean), str(sizes_path), str(bigwig_path)],
            check=True,
            capture_output=True,
        )
    finally:
        bg_clean.unlink(missing_ok=True)
        sizes_path.unlink(missing_ok=True)


def predict_probs(model, X: np.ndarray) -> np.ndarray:
    """
    Get per-window probability scores from a pre-built float32 feature matrix.
    For IsolationForest: normalise decision_function to [0, 1].
    For classifiers: use predict_proba[:,1].
    """
    if isinstance(model, IsolationForest):
        scores = model.decision_function(X)
        # Negate so anomalies → high scores, then min-max scale
        scores = -scores
        lo, hi = scores.min(), scores.max()
        if hi > lo:
            scores = (scores - lo) / (hi - lo)
        else:
            scores = np.zeros_like(scores)
        return scores
    return model.predict_proba(X)[:, 1]
