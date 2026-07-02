import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitJob } from "../api/client";
import BedUpload from "../components/BedUpload";
import GenomePicker from "../components/GenomePicker";
import InfoDot from "../components/InfoDot";

const flexLabel = { display: "flex", alignItems: "center" } as const;

const STEPS = ["Upload labels", "Training options"];

// Median width of the BED regions → a sensible default feature window. R-loop
// regions run a few hundred bp; G4 calls are ~25 bp. Rounded to a tidy value.
async function suggestWindowFromBed(file: File): Promise<number | null> {
  const text = await file.text();
  const widths: number[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("track") || t.startsWith("browser")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 3) continue;
    const s = parseInt(parts[1], 10);
    const e = parseInt(parts[2], 10);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) widths.push(e - s);
  }
  if (widths.length === 0) return null;
  widths.sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)];
  return Math.max(10, Math.round(median / 5) * 5);
}

export default function NewJob() {
  const navigate = useNavigate();
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr21");
  const [chromReady, setChromReady] = useState(false);
  const [windowSize, setWindowSize] = useState(200);
  const [modelParams, setModelParams] = useState({ n_estimators: 500, max_depth: 8 });
  const [negRatio, setNegRatio] = useState(3);
  const [bedFile, setBedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const handleBedChange = (file: File | null) => {
    setBedFile(file);
    if (file) {
      suggestWindowFromBed(file).then((w) => { if (w) setWindowSize(w); });
    }
  };

  const handleSubmit = async () => {
    if (!bedFile) {
      setError("Please upload a BED file");
      return;
    }
    if (!chromReady) {
      setError("Genome data is not yet ready — click 'Prepare data' first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { job_id } = await submitJob(
        { genome, chromosome, window_size: windowSize, features: null, model_params: modelParams, neg_ratio: negRatio, test_fraction: 0.2 },
        bedFile,
      );
      navigate(`/jobs/${job_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="container container--narrow route-fade">
      <h1 className="page-title">New Training Job</h1>
      <p className="page-sub" style={{ marginBottom: 24 }}>
        Pick a genome and chromosome, then configure the training job.
      </p>

      <GenomePicker
        genome={genome}
        chromosome={chromosome}
        onChange={(g, c) => { setGenome(g); setChromosome(c); }}
        onReady={setChromReady}
      />

      <div className="row" style={{ marginBottom: 32 }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className="row" style={{ flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <button
                onClick={() => setStep(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                  background: done ? "var(--accent-dark)" : active ? "var(--accent-deep)" : "var(--surface)",
                  border: `2px solid ${done ? "var(--accent-dark)" : active ? "var(--accent)" : "var(--border)"}`,
                  color: done || active ? "#fff" : "var(--text-fade)",
                  transition: "all 200ms ease",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                <span style={{
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? "var(--text)" : done ? "var(--text-mute)" : "var(--text-fade)",
                  whiteSpace: "nowrap",
                }} className="hide-on-mobile">
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 12px", minWidth: 16,
                  background: done ? "var(--accent-dark)" : "var(--border-soft)",
                  transition: "background 200ms ease",
                }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ minHeight: 240 }}>
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
              Upload label regions
            </h2>
            <p className="page-sub" style={{ marginBottom: 20 }}>
              Each BED region that overlaps a feature window labels it as positive.
            </p>
            <BedUpload file={bedFile} onChange={handleBedChange} />
            <div className="row row--wrap" style={{ marginTop: 18, gap: 24 }}>
              <label className="col col--gap-2" style={{ fontSize: 14 }}>
                <span className="mute" style={flexLabel}>
                  Feature window (bp)
                  <InfoDot
                    align="left"
                    text="Width (bp) of each window the model classifies. Auto-set from the median width of your BED regions. Smaller windows (e.g. ~25 bp for G4) localize sharper but produce many more windows; larger ones are coarser. The model stores this size and re-uses it when applied to other genomes."
                  />
                </span>
                <input
                  type="number" min={10} max={5000} step={5} value={windowSize}
                  onChange={(e) => setWindowSize(+e.target.value)}
                  className="input input--sm"
                  style={{ width: 110 }}
                />
                <span className="dim text-xs">
                  Auto-set from your BED region widths — adjust if needed (e.g. ~25 for G4).
                </span>
              </label>
              <label className="col col--gap-2" style={{ fontSize: 14 }}>
                <span className="mute" style={flexLabel}>
                  Negative : positive ratio
                  <InfoDot
                    align="left"
                    text="How many background (negative) windows to sample per positive window. 3 means a 1:3 positive:negative training set. The model needs enough negatives to learn — if your BED covers most of the chromosome there may not be enough background, which collapses the score toward random."
                  />
                </span>
                <input
                  type="number" min={1} max={20} value={negRatio}
                  onChange={(e) => setNegRatio(+e.target.value)}
                  className="input input--sm"
                  style={{ width: 110 }}
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
              Training options
            </h2>
            <p className="page-sub" style={{ marginBottom: 20 }}>
              An XGBoost classifier is trained on all 51 sequence features. Tune the hyperparameters if you like.
            </p>
            <div className="row row--wrap" style={{ gap: 24 }}>
              <label className="col col--gap-2" style={{ fontSize: 14 }}>
                <span className="mute" style={flexLabel}>
                  Trees (n_estimators)
                  <InfoDot
                    align="left"
                    text="Number of boosted trees in the XGBoost model. More trees can capture more detail but train slower and can overfit. 300–500 is a sensible range."
                  />
                </span>
                <input
                  type="number" min={50} max={1000} step={50} value={modelParams.n_estimators}
                  onChange={(e) => setModelParams({ ...modelParams, n_estimators: +e.target.value })}
                  className="input input--sm"
                  style={{ width: 110 }}
                />
              </label>
              <label className="col col--gap-2" style={{ fontSize: 14 }}>
                <span className="mute" style={flexLabel}>
                  Max depth
                  <InfoDot
                    align="left"
                    text="Maximum depth of each tree. Deeper trees model more complex feature interactions but overfit more easily. 6–10 works well for these sequence features."
                  />
                </span>
                <input
                  type="number" min={3} max={20} value={modelParams.max_depth}
                  onChange={(e) => setModelParams({ ...modelParams, max_depth: +e.target.value })}
                  className="input input--sm"
                  style={{ width: 110 }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{
          marginTop: 14, color: "var(--bad)", borderColor: "var(--bad)",
          background: "rgba(248,113,113,0.08)", fontSize: 14, padding: "12px 16px",
        }}>
          {error}
        </div>
      )}

      <div className="row row--between" style={{ marginTop: 20 }}>
        <button
          className="btn btn--ghost btn--lg"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Back
        </button>

        <span className="dim text-xs">
          Step {step + 1} of {STEPS.length}
        </span>

        {step < STEPS.length - 1 ? (
          <button className="btn btn--primary btn--lg" onClick={() => setStep((s) => s + 1)}>
            Next →
          </button>
        ) : (
          <button
            className="btn btn--primary btn--lg"
            onClick={handleSubmit}
            disabled={submitting || !chromReady}
            title={!chromReady ? "Prepare the chromosome data first" : undefined}
          >
            {submitting ? "Submitting…" : "Train model"}
          </button>
        )}
      </div>
    </div>
  );
}
