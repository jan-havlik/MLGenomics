"""
Feature metadata: names, groups, descriptions.
All 52 numeric features from phase0d_multi_feature.py.
"""

from typing import NamedTuple


class FeatureInfo(NamedTuple):
    name: str
    group: str
    description: str


FEATURE_CATALOG: list[FeatureInfo] = [
    # ── Base composition ──────────────────────────────────────────────────────
    FeatureInfo("gc_content",   "Composition", "GC fraction"),
    FeatureInfo("a_frac",       "Composition", "Adenine fraction"),
    FeatureInfo("c_frac",       "Composition", "Cytosine fraction"),
    FeatureInfo("g_frac",       "Composition", "Guanine fraction"),
    FeatureInfo("t_frac",       "Composition", "Thymine fraction"),
    # ── Skew ─────────────────────────────────────────────────────────────────
    FeatureInfo("gc_skew",      "Skew", "(G-C)/(G+C) strand asymmetry"),
    FeatureInfo("at_skew",      "Skew", "(A-T)/(A+T) strand asymmetry"),
    # ── Dinucleotides ─────────────────────────────────────────────────────────
    FeatureInfo("di_AA", "Dinucleotide", "AA dinucleotide frequency"),
    FeatureInfo("di_AC", "Dinucleotide", "AC dinucleotide frequency"),
    FeatureInfo("di_AG", "Dinucleotide", "AG dinucleotide frequency"),
    FeatureInfo("di_AT", "Dinucleotide", "AT dinucleotide frequency"),
    FeatureInfo("di_CA", "Dinucleotide", "CA dinucleotide frequency"),
    FeatureInfo("di_CC", "Dinucleotide", "CC dinucleotide frequency"),
    FeatureInfo("di_CG", "Dinucleotide", "CG dinucleotide frequency"),
    FeatureInfo("di_CT", "Dinucleotide", "CT dinucleotide frequency"),
    FeatureInfo("di_GA", "Dinucleotide", "GA dinucleotide frequency"),
    FeatureInfo("di_GC", "Dinucleotide", "GC dinucleotide frequency"),
    FeatureInfo("di_GG", "Dinucleotide", "GG dinucleotide frequency"),
    FeatureInfo("di_GT", "Dinucleotide", "GT dinucleotide frequency"),
    FeatureInfo("di_TA", "Dinucleotide", "TA dinucleotide frequency"),
    FeatureInfo("di_TC", "Dinucleotide", "TC dinucleotide frequency"),
    FeatureInfo("di_TG", "Dinucleotide", "TG dinucleotide frequency"),
    FeatureInfo("di_TT", "Dinucleotide", "TT dinucleotide frequency"),
    # ── G/C runs ─────────────────────────────────────────────────────────────
    FeatureInfo("g_run_count",    "G/C Runs", "Count of G≥3 homopolymer runs"),
    FeatureInfo("c_run_count",    "G/C Runs", "Count of C≥3 homopolymer runs"),
    FeatureInfo("max_g_run",      "G/C Runs", "Length of longest G run"),
    FeatureInfo("max_c_run",      "G/C Runs", "Length of longest C run"),
    FeatureInfo("total_g_run_bp", "G/C Runs", "Total bases in G runs"),
    FeatureInfo("total_c_run_bp", "G/C Runs", "Total bases in C runs"),
    # ── CpG ──────────────────────────────────────────────────────────────────
    FeatureInfo("cpg_count", "CpG", "Raw CpG dinucleotide count"),
    FeatureInfo("cpg_freq",  "CpG", "CpG frequency (normalised)"),
    FeatureInfo("cpg_oe",    "CpG", "CpG observed/expected ratio (island marker)"),
    FeatureInfo("tpg_freq",  "CpG", "TpG frequency (deamination product)"),
    FeatureInfo("cpa_freq",  "CpG", "CpA frequency (deamination product)"),
    # ── Complexity / entropy ──────────────────────────────────────────────────
    FeatureInfo("seq_complexity", "Complexity", "Unique 4-mers / max possible"),
    FeatureInfo("entropy",        "Complexity", "Shannon entropy of base composition"),
    FeatureInfo("purine_frac",    "Complexity", "(A+G)/length purine fraction"),
    # ── G-quadruplex ─────────────────────────────────────────────────────────
    FeatureInfo("g4_motif_count",  "G-Quadruplex", "G4 motif count (G-strand)"),
    FeatureInfo("c4_motif_count",  "G-Quadruplex", "G4 motif count (C-strand)"),
    FeatureInfo("g4_total",        "G-Quadruplex", "Total G4 motifs (both strands)"),
    FeatureInfo("g4_hunter_max",   "G-Quadruplex", "Max G/C richness in 25 bp windows"),
    FeatureInfo("g4_hunter_mean",  "G-Quadruplex", "Mean G/C richness across windows"),
    # ── R-loop ───────────────────────────────────────────────────────────────
    FeatureInfo("g_density_max",  "R-Loop", "Max G% in 50 bp sub-windows"),
    FeatureInfo("g_density_std",  "R-Loop", "Std-dev of G% density"),
    FeatureInfo("c_density_max",  "R-Loop", "Max C% in 50 bp sub-windows"),
    FeatureInfo("gc_skew_max",    "R-Loop", "Max local GC skew"),
    FeatureInfo("gc_skew_min",    "R-Loop", "Min local GC skew"),
    FeatureInfo("gc_skew_range",  "R-Loop", "Range of local GC skew variation"),
    # ── Structural ───────────────────────────────────────────────────────────
    FeatureInfo("tri_repeat_score",    "Structural", "Trinucleotide repeat frequency"),
    FeatureInfo("palindrome_density",  "Structural", "4-bp palindrome density"),
    FeatureInfo("longest_homopolymer", "Structural", "Maximum homopolymer run length"),
]

# Fast lookup
FEATURE_NAMES: list[str] = [f.name for f in FEATURE_CATALOG]
FEATURE_GROUPS: list[str] = sorted(set(f.group for f in FEATURE_CATALOG))
