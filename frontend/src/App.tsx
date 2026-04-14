import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect, useState, Component, ReactNode } from "react";
import { fetchJobs, deleteJob, JobListItem } from "./api/client";
import Nav from "./components/Nav";
import NewJob from "./pages/NewJob";
import JobResults from "./pages/JobResults";
import Library from "./pages/Library";

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", maxWidth: 700 }}>
          <h2 style={{ color: "#f87171", marginBottom: 12 }}>Render error</h2>
          <pre style={{
            background: "#1e293b", color: "#fca5a5", padding: 16,
            borderRadius: 8, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap",
          }}>
            {this.state.error.message}{"\n\n"}{this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16, padding: "8px 20px", background: "#334155",
              border: "none", borderRadius: 8, color: "#e2e8f0", cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Layout shell ──────────────────────────────────────────────────────────────
function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: 64 }}>
        {children}
      </main>
    </>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  pending:   "#f59e0b",
  running:   "#38bdf8",
  completed: "#34d399",
  failed:    "#f87171",
};

const STATUS_BG: Record<string, string> = {
  pending:   "rgba(245,158,11,0.08)",
  running:   "rgba(56,189,248,0.08)",
  completed: "rgba(52,211,153,0.08)",
  failed:    "rgba(248,113,113,0.08)",
};

const MODEL_LABEL: Record<string, string> = {
  xgboost:          "XGBoost",
  random_forest:    "Random Forest",
  isolation_forest: "Isolation Forest",
};

// ── Job list page ─────────────────────────────────────────────────────────────
function JobList() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const navigate = useNavigate();

  const load = () => fetchJobs().then(setJobs).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 2rem" }}>

      {/* Page header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ color: "#e2e8f0", margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px" }}>
          Training Jobs
        </h1>
        <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
          {jobs.length > 0
            ? `${jobs.length} job${jobs.length > 1 ? "s" : ""} — click any row to view results`
            : "No jobs yet — upload a BED file to get started"}
        </p>
      </div>

      {/* Empty state */}
      {jobs.length === 0 && (
        <div style={{
          textAlign: "center", padding: "5rem 2rem",
          border: "1px dashed #1e293b", borderRadius: 16,
          color: "#475569",
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🧬</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
            No jobs yet
          </div>
          <div style={{ fontSize: 14, marginBottom: 24 }}>
            Upload a BED file with positive-label regions to train your first classifier.
          </div>
          <button
            onClick={() => navigate("/new")}
            style={{
              padding: "12px 28px", background: "#0284c7", border: "none",
              borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            Start here
          </button>
        </div>
      )}

      {/* Job cards */}
      {jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((j) => {
            const color = STATUS_COLOR[j.status] || "#e2e8f0";
            const bg = STATUS_BG[j.status] || "transparent";
            return (
              <div
                key={j.job_id}
                onClick={() => navigate(`/jobs/${j.job_id}`)}
                style={{
                  background: "#1e293b", borderRadius: 14,
                  border: "1px solid #334155",
                  padding: "20px 24px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 24,
                  transition: "border-color 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#475569";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#334155";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Model name + ID */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
                    {MODEL_LABEL[j.model_type] ?? j.model_type}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {j.chromosome} · <span style={{ fontFamily: "monospace" }}>{j.job_id.slice(0, 8)}</span>
                    {" · "}{new Date(j.created_at).toLocaleString()}
                  </div>
                </div>

                {/* AUC */}
                {j.auc != null && (
                  <div style={{ textAlign: "center", minWidth: 80 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>ROC-AUC</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#38bdf8" }}>
                      {j.auc.toFixed(3)}
                    </div>
                  </div>
                )}

                {/* Status badge */}
                <div style={{
                  padding: "6px 14px", borderRadius: 20,
                  background: bg, border: `1px solid ${color}`,
                  fontSize: 13, fontWeight: 600, color, minWidth: 90, textAlign: "center",
                }}>
                  {j.status}
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteJob(j.job_id).then(load); }}
                  style={{
                    background: "none", border: "none", color: "#475569",
                    cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 8px",
                    borderRadius: 6, transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
                  title="Delete job"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<JobList />} />
          <Route path="/library" element={<Library />} />
          <Route path="/new" element={<NewJob />} />
          <Route path="/jobs/:jobId" element={<ErrorBoundary><JobResults /></ErrorBoundary>} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}
