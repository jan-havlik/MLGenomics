import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFeatures, submitJob, FeatureInfo } from "../api/client";
import BedUpload from "../components/BedUpload";
import FeatureSelector from "../components/FeatureSelector";
import ModelPicker from "../components/ModelPicker";

const STEPS = ["Upload labels", "Select features", "Configure model"];

export default function NewJob() {
  const navigate = useNavigate();
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [chromosome] = useState("chr21");
  const [modelType, setModelType] = useState("xgboost");
  const [modelParams, setModelParams] = useState({ n_estimators: 500, max_depth: 8 });
  const [negRatio, setNegRatio] = useState(3);
  const [bedFile, setBedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetchFeatures().then((fs) => {
      setFeatures(fs);
      setSelectedFeatures(new Set(fs.map((f) => f.name)));
    });
  }, []);

  const handleSubmit = async () => {
    if (modelType !== "isolation_forest" && !bedFile) {
      setError("Please upload a BED file");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const featureList = selectedFeatures.size === features.length ? null : [...selectedFeatures];
      const { job_id } = await submitJob(
        { chromosome, model_type: modelType, features: featureList, model_params: modelParams, neg_ratio: negRatio, test_fraction: 0.2 },
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
      <p className="page-sub" style={{ marginBottom: 32 }}>
        Train a classifier on {chromosome} (hg38) using pre-computed sequence features.
      </p>

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
              Each BED region that overlaps a 200 bp window labels it as positive.
            </p>
            <BedUpload file={bedFile} onChange={setBedFile} optional={modelType === "isolation_forest"} />
            <div style={{ marginTop: 18 }}>
              <label className="row row--gap-3 mute" style={{ fontSize: 14 }}>
                Negative : positive ratio
                <input
                  type="number" min={1} max={20} value={negRatio}
                  onChange={(e) => setNegRatio(+e.target.value)}
                  className="input input--sm"
                  style={{ width: 76 }}
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
              Select features
            </h2>
            <p className="page-sub" style={{ marginBottom: 16 }}>
              Toggle feature groups or individual features. Deselecting irrelevant groups often improves performance.
            </p>
            <div style={{ maxHeight: 380, overflowY: "auto", paddingRight: 8 }}>
              <FeatureSelector features={features} selected={selectedFeatures} onChange={setSelectedFeatures} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
              Configure model
            </h2>
            <p className="page-sub" style={{ marginBottom: 20 }}>
              Pick an algorithm and tune hyperparameters.
            </p>
            <ModelPicker
              modelType={modelType}
              params={modelParams}
              onChange={(t, p) => { setModelType(t); setModelParams(p); }}
            />
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
          <button className="btn btn--primary btn--lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Train model"}
          </button>
        )}
      </div>
    </div>
  );
}
