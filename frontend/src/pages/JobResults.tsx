import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchJob, JobStatus, exportUrl } from "../api/client";
import MetricsDisplay from "../components/MetricsDisplay";

const statusColor: Record<string, string> = {
  pending: "#f59e0b",
  running: "#38bdf8",
  completed: "#34d399",
  failed: "#f87171",
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

  if (error) return <div style={{ padding: "2rem", color: "#f87171" }}>{error}</div>;
  if (!job) return <div style={{ padding: "2rem", color: "#64748b" }}>Loading…</div>;

  const isRunning = job.status === "pending" || job.status === "running";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link to="/" style={{ color: "#64748b", textDecoration: "none", fontSize: 13 }}>
          ← All jobs
        </Link>
        <span style={{ color: "#334155" }}>/</span>
        <span style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>
          {job.job_id.slice(0, 8)}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#e2e8f0", margin: 0, fontSize: 22 }}>
            {job.model_type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </h1>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
            {job.chromosome} · created {new Date(job.created_at).toLocaleString()}
          </div>
        </div>
        <span style={{
          padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600,
          color: statusColor[job.status] || "#e2e8f0",
          border: `1px solid ${statusColor[job.status] || "#334155"}`,
        }}>
          {job.status}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.round(job.progress * 100)}%`,
              background: "#38bdf8",
              transition: "width 0.4s ease",
              borderRadius: 3,
            }} />
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            {Math.round(job.progress * 100)}% — training in progress…
          </div>
        </div>
      )}

      {/* Error */}
      {job.status === "failed" && job.error && (
        <div style={{
          background: "#2d1515", border: "1px solid #7f1d1d",
          borderRadius: 8, padding: 16, color: "#f87171", fontSize: 13, marginBottom: 24,
        }}>
          {job.error}
        </div>
      )}

      {/* Results */}
      {job.status === "completed" && job.metrics && (
        <div>
          <MetricsDisplay metrics={job.metrics} featureImportance={job.feature_importance} />
          <div style={{ marginTop: 28 }}>
            <a
              href={exportUrl(job.job_id)}
              download
              style={{
                display: "inline-block", padding: "10px 24px",
                background: "#0f766e", borderRadius: 8, color: "#e2e8f0",
                textDecoration: "none", fontSize: 14, fontWeight: 600,
              }}
            >
              Download BedGraph
            </a>
            <span style={{ marginLeft: 12, color: "#64748b", fontSize: 12 }}>
              {job.metrics.n_highconf_regions.toLocaleString()} high-confidence regions
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
