import type { ReactNode } from "react";
import { JobMetrics } from "../api/client";
import InfoDot from "./InfoDot";

interface Props {
  metrics: JobMetrics;
}

// Plain-language explanation of every metric — what it is and why it matters.
const HELP = {
  auc:
    "ROC-AUC on held-out test windows: the probability the model ranks a random " +
    "positive window above a random negative one. 0.5 = no better than chance, " +
    "1.0 = perfect. The headline measure of how well it separates your feature from background.",
  ap:
    "Average Precision = area under the precision–recall curve. Summarizes precision " +
    "across every threshold and stays informative when positives are rare. Higher is better.",
  cv:
    "Mean ROC-AUC across 5 cross-validation folds (± standard deviation). A more robust " +
    "estimate of how the model generalizes than a single split. A large ± spread means " +
    "the score is unstable.",
  precision:
    "Precision at the 0.5 cutoff (held-out test): of the windows the model flags, the " +
    "fraction that are truly your feature. High precision = few false alarms.",
  recall:
    "Recall / sensitivity at the 0.5 cutoff: of all true positive windows, the fraction the " +
    "model successfully flags. High recall = few missed sites.",
  f1:
    "F1 = harmonic mean of precision and recall — a single balanced score of 0.5-cutoff " +
    "performance. High only when both precision and recall are high.",
  specificity:
    "Specificity at the 0.5 cutoff: of all true background windows, the fraction correctly left " +
    "unflagged. High specificity = little background noise.",
  positives:
    "Genome windows labeled positive because they overlap a region in your training BED file.",
  negatives:
    "Background windows sampled as negatives (target count = neg:pos ratio). The model needs " +
    "enough of these to learn the contrast.",
  highconf:
    "Windows scored ≥ 0.5 across the whole chromosome — the detections exported to the BED / " +
    "bedGraph files. This is what you'd hand to a genome browser.",
  coverage:
    "Share of the scanned chromosome the model flagged at ≥ 0.5. Very high coverage usually " +
    "means the cutoff or the labels are too permissive.",
  flaggedbp:
    "Total base pairs covered by flagged windows (flagged windows × window size) — roughly how " +
    "much of the genome the model marks as your feature.",
  windows:
    "Total number of windows scored across the chromosome at this window size.",
} as const;

const fmtPct = (f: number) => `${(f * 100).toFixed(f * 100 < 1 ? 2 : 1)}%`;
const fmtBp = (bp: number) =>
  bp >= 1e6 ? `${(bp / 1e6).toFixed(2)} Mb` : bp >= 1e3 ? `${(bp / 1e3).toFixed(1)} kb` : `${bp} bp`;

type Tone = "good" | "warn" | "bad" | "info";
const TONE: Record<Tone, { color: string; bg: string }> = {
  good: { color: "#34d399", bg: "rgba(52,211,153,0.08)" },
  warn: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)" },
  bad: { color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  info: { color: "#38bdf8", bg: "rgba(56,189,248,0.08)" },
};

// What is this model good for? Turn the numbers into a recommendation a
// biologist can act on.
function buildVerdict(m: JobMetrics): { tone: Tone; title: string; body: string } {
  const isApply = m.precision == null; // label-free apply run
  const auc = m.auc;

  if (isApply) {
    return {
      tone: "info",
      title: "Applied model — detection run",
      body:
        `Scored ${m.n_windows_total.toLocaleString()} windows and flagged ` +
        `${m.n_highconf_regions.toLocaleString()} regions (${fmtPct(m.flagged_fraction)} of the chromosome, ` +
        `${fmtBp(m.flagged_bp)}). The quality scores below come from the model's original training — ` +
        `this run has no labels to score against. Export the BED / bedGraph to inspect the calls.`,
    };
  }

  let tone: Tone;
  let title: string;
  let lead: string;
  if (auc == null) {
    tone = "info"; title = "Trained"; lead = "Model trained.";
  } else if (auc >= 0.85) {
    tone = "good";
    title = "Strong detector — ready to apply";
    lead = "It ranks true sites well above background, so it's reliable for scanning other " +
      "genomes or chromosomes for candidate sites. Save it to the Library and apply it elsewhere.";
  } else if (auc >= 0.7) {
    tone = "warn";
    title = "Moderate detector — usable with care";
    lead = "Good enough to prioritize candidates, but expect a fair share of false positives. " +
      "Sharpening the labels or the feature window usually helps.";
  } else if (auc >= 0.6) {
    tone = "warn";
    title = "Weak detector";
    lead = "Only slightly better than chance — treat its calls as rough hints, not conclusions.";
  } else {
    tone = "bad";
    title = "Near-random — not usable yet";
    lead = "It can't separate your feature from background. Common causes: labels covering most of " +
      "the chromosome (too few negatives), a feature window that doesn't match your regions, or a " +
      "mislabeled BED. Fix those and retrain.";
  }

  const op =
    m.precision != null && m.recall != null
      ? ` At the 0.5 cutoff it's right ${fmtPct(m.precision)} of the time it fires (precision) and ` +
        `catches ${fmtPct(m.recall)} of known sites (recall).`
      : "";

  return { tone, title, body: lead + op };
}

function Badge({ label, value, color, info }: { label: string; value: string; color: string; info: string }) {
  return (
    <div style={{
      background: "#0f172a", border: `1px solid ${color}22`,
      borderRadius: 12, padding: "16px 20px", textAlign: "center", flex: 1, minWidth: 118,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "#64748b", marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
        <span>{label}</span>
        <InfoDot text={info} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#64748b",
      textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px",
    }}>
      {children}
    </div>
  );
}

export default function MetricsDisplay({ metrics }: Props) {
  const v = buildVerdict(metrics);
  const tone = TONE[v.tone];
  const hasOperatingPoint = metrics.precision != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Verdict — what is this model good for? */}
      <div style={{
        background: tone.bg, border: `1px solid ${tone.color}55`,
        borderRadius: 12, padding: "16px 20px",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: tone.color, marginBottom: 4 }}>
          {v.title}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#cbd5e1" }}>{v.body}</div>
      </div>

      {/* Ranking quality */}
      {metrics.auc != null && (
        <div>
          <SectionLabel>Ranking quality (held-out test)</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Badge label="ROC-AUC" value={metrics.auc.toFixed(3)} color="#38bdf8" info={HELP.auc} />
            {metrics.ap != null && <Badge label="Avg Precision" value={metrics.ap.toFixed(3)} color="#34d399" info={HELP.ap} />}
            {metrics.cv_auc_mean != null && (
              <Badge
                label="CV AUC (5-fold)"
                value={`${metrics.cv_auc_mean.toFixed(3)} ±${(metrics.cv_auc_std ?? 0).toFixed(3)}`}
                color="#a78bfa"
                info={HELP.cv}
              />
            )}
          </div>
        </div>
      )}

      {/* Operating point — only meaningful when this run had labels */}
      {hasOperatingPoint && (
        <div>
          <SectionLabel>Detection at the 0.5 cutoff</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Badge label="Precision" value={fmtPct(metrics.precision!)} color="#34d399" info={HELP.precision} />
            <Badge label="Recall" value={fmtPct(metrics.recall ?? 0)} color="#38bdf8" info={HELP.recall} />
            <Badge label="F1" value={(metrics.f1 ?? 0).toFixed(3)} color="#a78bfa" info={HELP.f1} />
            <Badge label="Specificity" value={fmtPct(metrics.specificity ?? 0)} color="#fbbf24" info={HELP.specificity} />
          </div>
        </div>
      )}

      {/* Genome scan */}
      <div>
        <SectionLabel>Genome scan ({metrics.n_windows_total.toLocaleString()} windows)</SectionLabel>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Badge label="Detections" value={metrics.n_highconf_regions.toLocaleString()} color="#f472b6" info={HELP.highconf} />
          <Badge label="Coverage" value={fmtPct(metrics.flagged_fraction)} color="#fb923c" info={HELP.coverage} />
          <Badge label="Flagged bp" value={fmtBp(metrics.flagged_bp)} color="#22d3ee" info={HELP.flaggedbp} />
          {hasOperatingPoint && (
            <>
              <Badge label="Train positives" value={metrics.n_positives.toLocaleString()} color="#fb923c" info={HELP.positives} />
              <Badge label="Train negatives" value={metrics.n_negatives.toLocaleString()} color="#64748b" info={HELP.negatives} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
