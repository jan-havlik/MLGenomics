"""
Feature extraction from FASTA: produces a parquet matching the schema
expected by the training task (52 numeric features + _start, _end).

Ported from research/phase0d_multi_feature.py (deleted in cleanup, recovered
from initial commit). Window size and step are 200 bp non-overlapping —
must stay in sync with the existing data/features_master.parquet.
"""
from __future__ import annotations

import re
from collections import Counter
from itertools import product as iter_product
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd

from app.core.features import FEATURE_NAMES

WINDOW_SIZE = 200
STEP_SIZE = 200

ProgressFn = Callable[[float, str], None]


def parse_fasta(path: Path) -> str:
    """Read single-chromosome FASTA → uppercase concatenated sequence."""
    parts: list[str] = []
    with open(path) as f:
        for line in f:
            if not line.startswith(">"):
                parts.append(line.strip().upper())
    return "".join(parts)


def _kmer_freq(seq: str, k: int = 2) -> dict[str, float]:
    bases = ["A", "C", "G", "T"]
    kmers = ["".join(c) for c in iter_product(bases, repeat=k)]
    counts: Counter[str] = Counter()
    for i in range(len(seq) - k + 1):
        km = seq[i:i + k]
        if all(b in "ACGT" for b in km):
            counts[km] += 1
    total = sum(counts.values())
    if total == 0:
        return {km: 0.0 for km in kmers}
    return {km: counts[km] / total for km in kmers}


def compute_features(sequence: str, start: int, end: int) -> Optional[dict]:
    """Compute the 52 features for sequence[start:end]. Returns None if >50% N."""
    subseq = sequence[start:end]
    length = len(subseq)
    clean = subseq.replace("N", "")
    cl = len(clean)
    if cl < length * 0.5:
        return None

    a = clean.count("A"); c = clean.count("C")
    g = clean.count("G"); t = clean.count("T")

    f: dict = {}

    # Composition
    f["gc_content"] = (g + c) / cl
    f["a_frac"] = a / cl
    f["c_frac"] = c / cl
    f["g_frac"] = g / cl
    f["t_frac"] = t / cl

    # Skew
    gc_s = g + c
    at_s = a + t
    f["gc_skew"] = (g - c) / gc_s if gc_s > 0 else 0
    f["at_skew"] = (a - t) / at_s if at_s > 0 else 0

    # Dinucleotides
    for km, freq in _kmer_freq(clean, k=2).items():
        f[f"di_{km}"] = freq

    # G/C runs
    g_runs = [len(m.group()) for m in re.finditer(r"G{3,}", clean)]
    c_runs = [len(m.group()) for m in re.finditer(r"C{3,}", clean)]
    f["g_run_count"] = len(g_runs)
    f["c_run_count"] = len(c_runs)
    f["max_g_run"] = max(g_runs) if g_runs else 0
    f["max_c_run"] = max(c_runs) if c_runs else 0
    f["total_g_run_bp"] = sum(g_runs)
    f["total_c_run_bp"] = sum(c_runs)

    # CpG
    cpg_obs = clean.count("CG")
    cpg_exp_denom = (c * g) / cl if cl > 0 else 0
    f["cpg_count"] = cpg_obs
    f["cpg_freq"] = cpg_obs / (cl - 1) if cl > 1 else 0
    f["cpg_oe"] = (cpg_obs / cl) / (cpg_exp_denom / cl) if cpg_exp_denom > 0 else 0
    f["tpg_freq"] = clean.count("TG") / (cl - 1) if cl > 1 else 0
    f["cpa_freq"] = clean.count("CA") / (cl - 1) if cl > 1 else 0

    # Complexity / entropy
    if cl >= 4:
        unique_4 = len({clean[i:i + 4] for i in range(cl - 3)})
        f["seq_complexity"] = unique_4 / min(cl - 3, 256)
    else:
        f["seq_complexity"] = 0
    probs = [a / cl, c / cl, g / cl, t / cl]
    f["entropy"] = -sum(p * np.log2(p) if p > 0 else 0 for p in probs)
    f["purine_frac"] = (a + g) / cl

    # G-quadruplex
    g4_matches = list(re.finditer(
        r"G{3,7}.{1,7}G{3,7}.{1,7}G{3,7}.{1,7}G{3,7}", clean))
    c4_matches = list(re.finditer(
        r"C{3,7}.{1,7}C{3,7}.{1,7}C{3,7}.{1,7}C{3,7}", clean))
    f["g4_motif_count"] = len(g4_matches)
    f["c4_motif_count"] = len(c4_matches)
    f["g4_total"] = len(g4_matches) + len(c4_matches)

    g4_scores: list[float] = []
    for i in range(0, max(1, cl - 24), 12):
        sub = clean[i:i + 25]
        if len(sub) >= 20:
            gs = sub.count("G"); cs = sub.count("C")
            g4_scores.append(max(gs, cs) / len(sub))
    f["g4_hunter_max"] = max(g4_scores) if g4_scores else 0
    f["g4_hunter_mean"] = float(np.mean(g4_scores)) if g4_scores else 0

    # R-loop sub-window stats
    g_dens: list[float] = []; c_dens: list[float] = []; skews: list[float] = []
    for i in range(0, max(1, cl - 49), 25):
        sub = clean[i:i + 50]
        if len(sub) >= 25:
            sg = sub.count("G"); sc = sub.count("C")
            g_dens.append(sg / len(sub))
            c_dens.append(sc / len(sub))
            if sg + sc > 0:
                skews.append((sg - sc) / (sg + sc))
    f["g_density_max"] = max(g_dens) if g_dens else 0
    f["g_density_std"] = float(np.std(g_dens)) if len(g_dens) > 1 else 0
    f["c_density_max"] = max(c_dens) if c_dens else 0
    f["gc_skew_max"] = max(skews) if skews else 0
    f["gc_skew_min"] = min(skews) if skews else 0
    f["gc_skew_range"] = (max(skews) - min(skews)) if skews else 0

    # Structural
    tri_score = 0
    for i in range(0, cl - 5, 3):
        if clean[i:i + 3] == clean[i + 3:i + 6]:
            tri_score += 1
    f["tri_repeat_score"] = tri_score / (cl / 3) if cl >= 6 else 0

    comp = str.maketrans("ACGT", "TGCA")
    pal = 0
    for i in range(cl - 3):
        tet = clean[i:i + 4]
        if all(b in "ACGT" for b in tet) and tet == tet.translate(comp)[::-1]:
            pal += 1
    f["palindrome_density"] = pal / (cl - 3) if cl > 3 else 0

    f["longest_homopolymer"] = max(
        (len(m.group()) for m in re.finditer(r"(.)\1+", clean)), default=1)

    return f


def extract_to_parquet(
    fasta_path: Path,
    parquet_path: Path,
    progress: ProgressFn | None = None,
) -> int:
    """
    Extract 52 features over 200bp non-overlapping windows.
    Writes parquet with columns: _start, _end, <52 features>.
    Returns the number of windows written.
    """
    if progress:
        progress(0.0, f"Parsing {fasta_path.name}")
    sequence = parse_fasta(fasta_path)
    seq_len = len(sequence)
    n_windows = (seq_len - WINDOW_SIZE) // STEP_SIZE + 1

    if progress:
        progress(0.05, f"Computing features over {n_windows:,} windows ({seq_len:,} bp)")

    records: list[dict] = []
    report_every = max(1, n_windows // 50)
    for i in range(n_windows):
        start = i * STEP_SIZE
        end = start + WINDOW_SIZE
        if end > seq_len:
            break
        feats = compute_features(sequence, start, end)
        if feats is None:
            continue
        feats["_start"] = start
        feats["_end"] = end
        records.append(feats)
        if progress and i % report_every == 0:
            progress(0.05 + 0.90 * (i / n_windows), f"Window {i:,}/{n_windows:,}")

    if progress:
        progress(0.96, f"Writing parquet ({len(records):,} rows)")

    column_order = ["_start", "_end"] + FEATURE_NAMES
    df = pd.DataFrame(records, columns=column_order)
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(parquet_path, index=False)

    if progress:
        progress(1.0, f"Done — {len(records):,} windows")

    return len(records)
