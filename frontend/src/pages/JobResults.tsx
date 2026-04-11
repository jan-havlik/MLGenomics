import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchJob, JobStatus, exportUrl } from "../api/client";
import MetricsDisplay from "../components/MetricsDisplay";

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

          {/* Export */}
          <div style={{
            background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
            padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
                Export predictions
              </div>
              <div style={{ fontSize: 14, color: "#64748b" }}>
                {job.metrics.n_highconf_regions.toLocaleString()} high-confidence regions · bedGraph format
              </div>
            </div>
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
      )}
    </div>
  );
}
