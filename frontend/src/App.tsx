import { Routes, Route, useNavigate } from "react-router-dom";
import { Component, ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { fetchJobs, deleteJob, JobListItem } from "./api/client";
import { usePolling } from "./api/usePolling";
import Nav from "./components/Nav";
import TopProgress from "./components/TopProgress";
import { PageSkeleton } from "./components/Skeleton";

// Routes split into separate chunks so the initial bundle stays small.
const NewJob     = lazy(() => import("./pages/NewJob"));
const JobResults = lazy(() => import("./pages/JobResults"));
const Library    = lazy(() => import("./pages/Library"));

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
        <div className="container container--narrow">
          <h2 style={{ color: "var(--bad)", marginBottom: 12 }}>Render error</h2>
          <pre style={{
            background: "var(--surface)", color: "#fca5a5", padding: 16,
            borderRadius: 8, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap",
          }}>
            {this.state.error.message}{"\n\n"}{this.state.error.stack}
          </pre>
          <button
            className="btn btn--ghost"
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16 }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CLASS: Record<string, string> = {
  pending:   "status-pending",
  running:   "status-running",
  completed: "status-completed",
  failed:    "status-failed",
};

const MODEL_LABEL: Record<string, string> = {
  xgboost:          "XGBoost",
  random_forest:    "Random Forest",
  isolation_forest: "Isolation Forest",
};

// ── Job list page ─────────────────────────────────────────────────────────────
function JobList() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  // First fetch is non-silent so the top bar shows; polling is silent.
  useEffect(() => {
    fetchJobs()
      .then((d) => { setJobs(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  usePolling(async () => {
    const data = await fetchJobs({ silent: true });
    setJobs(data);
  }, 5000, loaded);

  const remove = async (id: string) => {
    await deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.job_id !== id));
  };

  return (
    <div className="container route-fade">
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Training Jobs</h1>
        <p className="page-sub">
          {!loaded
            ? "Loading jobs…"
            : jobs.length > 0
              ? `${jobs.length} job${jobs.length > 1 ? "s" : ""} — click any row to view results`
              : "No jobs yet — upload a BED file to get started"}
        </p>
      </div>

      {!loaded && (
        <div className="col col--gap-3">
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 72, borderRadius: 14 }} />
        </div>
      )}

      {loaded && jobs.length === 0 && (
        <div className="empty">
          <div className="empty__icon">🧬</div>
          <div className="empty__title">No jobs yet</div>
          <div className="empty__msg">
            Upload a BED file with positive-label regions to train your first classifier.
          </div>
          <button className="btn btn--primary btn--lg" onClick={() => navigate("/new")}>
            Start here
          </button>
        </div>
      )}

      {loaded && jobs.length > 0 && (
        <div className="col col--gap-3">
          {jobs.map((j) => {
            const cls = STATUS_CLASS[j.status] ?? "";
            return (
              <div
                key={j.job_id}
                className="job-row"
                onClick={() => navigate(`/jobs/${j.job_id}`)}
              >
                <div className="job-row__main">
                  <div className="job-row__title">
                    {MODEL_LABEL[j.model_type] ?? j.model_type}
                  </div>
                  <div className="job-row__meta">
                    {j.chromosome} · <span className="mono">{j.job_id.slice(0, 8)}</span>
                    <span className="hide-on-mobile">
                      {" · "}{new Date(j.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {j.auc != null && (
                  <div className="job-row__auc">
                    <div className="job-row__auc-value">{j.auc.toFixed(3)}</div>
                    <div className="job-row__auc-label">AUC</div>
                  </div>
                )}

                <div className={`badge badge--lg ${cls}`} style={{ minWidth: 90, justifyContent: "center" }}>
                  {j.status}
                </div>

                <button
                  className="btn--icon"
                  onClick={(e) => { e.stopPropagation(); remove(j.job_id); }}
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
      <TopProgress />
      <Nav />
      <main style={{ paddingTop: 60 }}>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<JobList />} />
            <Route path="/library" element={<Library />} />
            <Route path="/new" element={<NewJob />} />
            <Route path="/jobs/:jobId" element={<ErrorBoundary><JobResults /></ErrorBoundary>} />
          </Routes>
        </Suspense>
      </main>
    </ErrorBoundary>
  );
}
