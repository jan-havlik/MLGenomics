import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchJob, JobStatus, exportUrl, saveToLibrary, SaveToLibraryRequest } from "../api/client";
import MetricsDisplay from "../components/MetricsDisplay";
import IgvViewer from "../components/IgvViewer";

const STATUS_COLOR: Record<string, string> = {
  pending:   "#f59e0b",
  running:   "#38bdf8",
  completed: "#34d399",
  failed:    "#f87171",
};

const STATUS_BG: Record<string, string> = {
  pending:   "rgba(245,158,11,0.1)",
  running:   "rgba(56,189,248,0.1)",
  completed: "rgba(52,211,153,0.1)",
  failed:    "rgba(248,113,113,0.1)",
};

const MODEL_LABEL: Record<string, string> = {
  xgboost:          "XGBoost",
  random_forest:    "Random Forest",
  isolation_forest: "Isolation Forest",
};

function SaveToLibraryForm({ jobId, onSaved }: { jobId: string; onSaved: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<SaveToLibraryRequest>({
    name: "",
    display_name: "",
    description: "",
    tags: [],
  });

  if (savedName) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#34d399", fontWeight: 600, fontSize: 14 }}>✓ Saved to library</span>
        <Link
          to="/library"
          style={{ color: "#38bdf8", fontSize: 14, textDecoration: "none", fontWeight: 500 }}
        >
          View Library →
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 22px", background: "transparent",
          border: "1px solid #334155", borderRadius: 10, color: "#94a3b8",
          fontSize: 14, fontWeight: 500, cursor: "pointer",
        }}
      >
        Save to Library
      </button>
    );
  }

  const handleSubmit = async () => {
    if (!form.name || !form.display_name) {
      setErr("Slug and display name are required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveToLibrary(jobId, form);
      setSavedName(form.name);
      onSaved(form.name);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "#0f172a", border: "1px solid #334155",
    borderRadius: 8, color: "#e2e8f0", fontSize: 14,
    boxSizing: "border-box",
  };

  return (
    <div style={{
      background: "#0f172a", border: "1px solid #334155",
      borderRadius: 12, padding: "20px 24px", marginTop: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 16 }}>
        Save model to library
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
            Slug (e.g. rlfs-xgb)
          </label>
          <input
            style={inputStyle}
            placeholder="my-model-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
            Display name
          </label>
          <input
            style={inputStyle}
            placeholder="RLFS XGBoost chr21"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
          Description (optional)
        </label>
        <input
          style={inputStyle}
          placeholder="Brief description of this model"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
          Tags (comma-separated, optional)
        </label>
        <input
          style={inputStyle}
          placeholder="rlfs, phase0, validated"
          onChange={(e) =>
            setForm({ ...form, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
          }
        />
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: "10px 22px", background: "#0369a1",
            borderRadius: 8, color: "#e2e8f0", border: "none",
            fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: "10px 18px", background: "transparent",
            borderRadius: 8, color: "#64748b", border: "1px solid #334155",
            fontSize: 14, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function JobResults() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const load = async () => {
      try {
        const data = await fetchJob(jobId);
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        setError("Could not load job");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };
    load();
    intervalRef.current = setInterval(load, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId]);

  if (error) return (
    <div style={{ padding: "3rem 2rem", color: "#f87171", fontSize: 15 }}>{error}</div>
  );
  if (!job) return (
    <div style={{ padding: "3rem 2rem", color: "#64748b", fontSize: 15 }}>Loading…</div>
  );

  const isRunning = job.status === "pending" || job.status === "running";
  const color = STATUS_COLOR[job.status] || "#e2e8f0";
  const bg = STATUS_BG[job.status] || "transparent";
  const canSave = job.status === "completed" && job.model_type !== "isolation_forest";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 2rem" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, fontSize: 14 }}>
        <Link to="/" style={{ color: "#64748b", textDecoration: "none" }}>Jobs</Link>
        <span style={{ color: "#334155" }}>›</span>
        <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{job.job_id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px", letterSpacing: "-0.5px" }}>
            {MODEL_LABEL[job.model_type] ?? job.model_type}
          </h1>
          <div style={{ fontSize: 14, color: "#64748b" }}>
            {job.chromosome} · {new Date(job.created_at).toLocaleString()}
          </div>
        </div>
        <div style={{
          padding: "8px 20px", borderRadius: 24,
          background: bg, border: `1px solid ${color}`,
          fontSize: 14, fontWeight: 700, color,
        }}>
          {job.status}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{
          background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
          padding: "24px 28px", marginBottom: 32,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: "#94a3b8", fontSize: 14 }}>Training in progress…</span>
            <span style={{ color: "#38bdf8", fontSize: 14, fontWeight: 600 }}>
              {Math.round(job.progress * 100)}%
            </span>
          </div>
          <div style={{ height: 8, background: "#0f172a", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.round(job.progress * 100)}%`,
              background: "linear-gradient(90deg, #0284c7, #38bdf8)",
              borderRadius: 4, transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      {/* Error */}
      {job.status === "failed" && job.error && (
        <div style={{
          background: "rgba(248,113,113,0.08)", border: "1px solid #f87171",
          borderRadius: 12, padding: "20px 24px", color: "#f87171", fontSize: 14, marginBottom: 32,
        }}>
          {job.error}
        </div>
      )}

      {/* Results */}
      {job.status === "completed" && job.metrics && (
        <div>
          {/* Genome browser */}
          <IgvViewer jobId={job.job_id} chromosome={job.chromosome} />

          {/* Metrics card */}
          <div style={{
            background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
            padding: "28px 32px", marginBottom: 24,
          }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", margin: "0 0 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Results
            </h2>
            <MetricsDisplay metrics={job.metrics} featureImportance={job.feature_importance} />
          </div>

          {/* Export + save */}
          <div style={{
            background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
            padding: "24px 32px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
                  Export predictions
                </div>
                <div style={{ fontSize: 14, color: "#64748b" }}>
                  {job.metrics.n_highconf_regions.toLocaleString()} high-confidence regions · bedGraph format
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {canSave && (
                  <div>
                    <SaveToLibraryForm jobId={job.job_id} onSaved={() => {}} />
                  </div>
                )}
                <a
                  href={exportUrl(job.job_id)}
                  download
                  style={{
                    padding: "12px 28px", background: "#0f766e",
                    borderRadius: 10, color: "#e2e8f0",
                    textDecoration: "none", fontSize: 15, fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  Download BedGraph
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
