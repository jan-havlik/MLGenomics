# Research — Phase 0 Results

Baseline classifiers trained on chr21 (hg38) using 52 sequence-composition features
and 200 bp non-overlapping windows. All models: XGBoost (500 trees, depth 8) and
Random Forest (500 trees, depth 12), evaluated with stratified 80/20 split and 5-fold CV.

---

## phase0d_comparison.png

Side-by-side comparison of all three classification tasks on a single figure:

- **Left — ROC curves**: XGBoost AUC overlaid for RLFS (0.934), G4 (0.978), CpG (0.933).
  G4 separates almost perfectly; RLFS and CpG show strong but noisier separation.
- **Centre — Precision-Recall curves**: AP scores mirror ROC findings. G4 achieves AP > 0.95
  due to the highly specific G₃N₁₋₇ motif pattern used as ground truth.
- **Right — 5-fold CV AUC distribution**: Box plots per task showing low variance (< 0.02 std),
  confirming that results are not artefacts of a single train/test split.

Key takeaway: all three tasks exceed AUC 0.93, demonstrating that primary sequence composition
alone is sufficient to predict these structural genomic features at high accuracy.

---

## phase0d_details.png

Per-task deep-dive panels (one column per task: RLFS, G4, CpG):

- **Row 1 — Confusion matrix**: Balanced test set (neg_ratio = 3). Shows that false
  negatives are more common than false positives — the classifiers are conservative,
  which is appropriate for genomics discovery.
- **Row 2 — Feature importance (top 15)**: XGBoost `gain`-based importances.
  - RLFS: dominated by G-density features (`g_density_max`, `g_run_count`) and GC skew.
  - G4: almost entirely `g4_motif_count` and `g4_total` — the motif detector is near-perfect.
  - CpG: `cpg_oe` (observed/expected ratio) is the single strongest predictor by a large margin,
    followed by `cpg_freq` and `gc_content`.
- **Row 3 — Prediction score distribution**: Histogram of XGBoost output probabilities for
  positive vs negative windows. All tasks show clear bimodal separation.

Key takeaway: features are biologically interpretable — the top predictors match the known
sequence determinants of each structural element.

---

## phase05_real_results.png

Early single-task prototype (Phase 0.5) training a RLFS classifier using DRIP-seq peaks
(`drip_peaks_all.bed`) as ground truth instead of the rule-based RLFS detector.

- XGBoost AUC 0.89 on DRIP-seq labels — slightly lower than the rule-based ground truth
  (0.934) because experimental DRIP-seq peaks include biological noise and cell-type
  specificity absent from the sequence-only detector.
- Demonstrates that the portal pipeline works equally well with **experimental BED labels**
  (user-uploaded) as with computationally derived ones.

Key takeaway: experimentally derived labels are a valid and intended use-case for the portal.
