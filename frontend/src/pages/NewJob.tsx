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
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 2rem" }}>

      {/* Page title */}
      <h1 style={{ fontSize: 32, fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
        New Training Job
      </h1>
      <p style={{ color: "#64748b", fontSize: 15, marginBottom: 40 }}>
        Train a classifier on {chromosome} (hg38) using pre-computed sequence features.
      </p>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <button
                onClick={() => setStep(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                {/* Circle */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, flexShrink: 0,
                  background: done ? "#0369a1" : active ? "#0284c7" : "#1e293b",
                  border: `2px solid ${done ? "#0369a1" : active ? "#38bdf8" : "#334155"}`,
                  color: done || active ? "#fff" : "#475569",
                  transition: "all 0.2s",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                {/* Label */}
                <span style={{
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  color: active ? "#e2e8f0" : done ? "#94a3b8" : "#475569",
                  whiteSpace: "nowrap",
                }}>
                  {label}
                </span>
              </button>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 12px",
                  background: done ? "#0369a1" : "#1e293b",
                  transition: "background 0.2s",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{
        background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
        padding: "32px 36px", minHeight: 280,
      }}>

        {/* Step 0 — BED upload */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", margin: "0 0 6px" }}>
              Upload label regions
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>
              Each BED region that overlaps a 200 bp window labels it as positive.
            </p>
            <BedUpload file={bedFile} onChange={setBedFile} optional={modelType === "isolation_forest"} />
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 14, color: "#94a3b8", display: "flex", alignItems: "center", gap: 10 }}>
                Negative : positive ratio
                <input
                  type="number" min={1} max={20} value={negRatio}
                  onChange={(e) => setNegRatio(+e.target.value)}
                  style={{
                    width: 68, background: "#0f172a", border: "1px solid #334155",
                    color: "#e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 14,
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {/* Step 1 — Features */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", margin: "0 0 6px" }}>
              Select features
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
              Toggle feature groups or individual features. Deselecting irrelevant groups often improves performance.
            </p>
            <div style={{ maxHeight: 380, overflowY: "auto", paddingRight: 8 }}>
              <FeatureSelector features={features} selected={selectedFeatures} onChange={setSelectedFeatures} />
            </div>
          </div>
        )}

        {/* Step 2 — Model */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", margin: "0 0 6px" }}>
              Configure model
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>
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

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16, padding: "12px 16px",
          background: "rgba(248,113,113,0.08)", border: "1px solid #f87171",
          borderRadius: 10, color: "#f87171", fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          style={navBtn(step === 0)}
        >
          ← Back
        </button>

        <span style={{ fontSize: 13, color: "#475569" }}>
          Step {step + 1} of {STEPS.length}
        </span>

        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} style={navBtn(false, true)}>
            Next →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} style={navBtn(submitting, true)}>
            {submitting ? "Submitting…" : "Train model"}
          </button>
        )}
      </div>
    </div>
  );
}

const navBtn = (disabled: boolean, primary = false): React.CSSProperties => ({
  padding: "12px 28px", borderRadius: 10, border: "none",
  background: disabled ? "#1e293b" : primary ? "#0284c7" : "#334155",
  color: disabled ? "#475569" : "#e2e8f0",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 15, fontWeight: 600,
  transition: "background 0.15s",
});
