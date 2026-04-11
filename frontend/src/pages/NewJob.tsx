import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFeatures, fetchChromosomes, submitJob, FeatureInfo } from "../api/client";
import BedUpload from "../components/BedUpload";
import FeatureSelector from "../components/FeatureSelector";
import ModelPicker from "../components/ModelPicker";

export default function NewJob() {
  const navigate = useNavigate();
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [chromosome, setChromosome] = useState("chr21");
  const [modelType, setModelType] = useState("xgboost");
  const [modelParams, setModelParams] = useState({ n_estimators: 500, max_depth: 8 });
  const [negRatio, setNegRatio] = useState(3);
  const [bedFile, setBedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0: BED, 1: features, 2: model

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
      const featureList = selectedFeatures.size === features.length
        ? null
        : [...selectedFeatures];
      const { job_id } = await submitJob(
        {
          chromosome,
          model_type: modelType,
          features: featureList,
          model_params: modelParams,
          neg_ratio: negRatio,
          test_fraction: 0.2,
        },
        bedFile,
      );
      navigate(`/jobs/${job_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
      setSubmitting(false);
    }
  };

  const steps = ["Upload labels", "Select features", "Configure model"];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ color: "#e2e8f0", marginBottom: 8 }}>New Training Job</h1>
      <p style={{ color: "#64748b", marginBottom: 28, fontSize: 14 }}>
        Upload BED labels, select features, and train a classifier on chr21 (hg38).
      </p>

      {/* Step tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #1e293b" }}>
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            style={{
              padding: "10px 20px", border: "none", background: "none",
              color: step === i ? "#38bdf8" : "#64748b",
              borderBottom: step === i ? "2px solid #38bdf8" : "2px solid transparent",
              cursor: "pointer", fontSize: 14, fontWeight: step === i ? 600 : 400,
            }}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Step 0: BED upload */}
      {step === 0 && (
        <div>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
            Upload a BED file with positive-label regions. Each region that overlaps a 200 bp window marks it as positive.
          </p>
          <BedUpload
            file={bedFile}
            onChange={setBedFile}
            optional={modelType === "isolation_forest"}
          />
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontSize: 13, color: "#94a3b8" }}>
              Neg:Pos ratio
              <input
                type="number" min={1} max={20} value={negRatio}
                onChange={(e) => setNegRatio(+e.target.value)}
                style={{
                  marginLeft: 8, width: 60, background: "#1e293b",
                  border: "1px solid #334155", color: "#e2e8f0",
                  borderRadius: 6, padding: "3px 6px", fontSize: 13,
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 1: Feature selection */}
      {step === 1 && (
        <div style={{ maxHeight: 460, overflowY: "auto", paddingRight: 8 }}>
          <FeatureSelector
            features={features}
            selected={selectedFeatures}
            onChange={setSelectedFeatures}
          />
        </div>
      )}

      {/* Step 2: Model picker */}
      {step === 2 && (
        <ModelPicker
          modelType={modelType}
          params={modelParams}
          onChange={(t, p) => { setModelType(t); setModelParams(p); }}
        />
      )}

      {error && (
        <div style={{ marginTop: 16, color: "#f87171", fontSize: 13 }}>{error}</div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          style={navBtn(step === 0)}
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} style={navBtn(false, true)}>
            Next
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
  padding: "10px 24px", borderRadius: 8, border: "none",
  background: disabled ? "#1e293b" : primary ? "#0284c7" : "#334155",
  color: disabled ? "#475569" : "#e2e8f0",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 14, fontWeight: 600,
});
