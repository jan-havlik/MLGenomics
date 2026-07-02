import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchJob, JobStatus, exportUrl, saveToLibrary } from "../api/client";
import { usePolling } from "../api/usePolling";
import MetricsDisplay from "../components/MetricsDisplay";
import IgvViewer from "../components/IgvViewer";
import InfoDot from "../components/InfoDot";
import { Skeleton } from "../components/Skeleton";

interface StageEntry {
  stage: string;
  progress: number;
  at: number; // wall-clock ms
}

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

function SaveToLibraryForm({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");

  if (savedName) {
    return (
      <div className="row row--gap-3">
        <span style={{ color: "var(--good)", fontWeight: 600, fontSize: 14 }}>✓ Saved to library</span>
        <Link to="/library" style={{ color: "var(--accent)", fontSize: 14, textDecoration: "none", fontWeight: 500 }}>
          View Library →
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn btn--ghost" onClick={() => setOpen(true)}>
        Save to Library
      </button>
    );
  }

  const handleSubmit = async () => {
    const display = name.trim();
    const slug = display.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) {
      setErr("Please enter a name");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveToLibrary(jobId, { name: slug, display_name: display });
      setSavedName(slug);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card--inset" style={{ marginTop: 16, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        <span>Save model to library</span>
        <InfoDot
          align="left"
          text="Saves this trained model to your Library. From there you can apply it to any other genome / chromosome — e.g. detect on mouse what you trained on human — without retraining."
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="label">Name</label>
        <input
          className="input"
          placeholder="RLFS XGBoost chr21"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          autoFocus
        />
      </div>
      {err && <div style={{ color: "var(--bad)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="row row--gap-3">
        <button className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StageLog({ stages }: { stages: StageEntry[] }) {
  const startedAt = stages[0].at;
  // Show the most recent entries first (newest at top).
  const display = [...stages].reverse().slice(0, 8);

  return (
    <div style={{
      marginTop: 16,
      paddingTop: 14,
      borderTop: "1px solid var(--border-soft)",
    }}>
      <div className="section-label" style={{ margin: "0 0 10px" }}>
        Training log
      </div>
      <div className="col" style={{ gap: 4, fontSize: 12 }}>
        {display.map((s, i) => {
          const elapsed = ((s.at - startedAt) / 1000).toFixed(1);
          const isLatest = i === 0;
          return (
            <div
              key={`${s.at}-${i}`}
              className="row row--gap-3"
              style={{
                padding: "4px 0",
                color: isLatest ? "var(--text)" : "var(--text-mute)",
                opacity: isLatest ? 1 : Math.max(0.45, 1 - i * 0.08),
              }}
            >
              <span className="mono dim" style={{ minWidth: 56, textAlign: "right" }}>
                +{elapsed}s
              </span>
              <span className="mono dim" style={{ minWidth: 36, textAlign: "right" }}>
                {Math.round(s.progress * 100)}%
              </span>
              <span style={{ flex: 1 }}>
                {isLatest && <span style={{ color: "var(--accent)", marginRight: 6 }}>›</span>}
                {s.stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JobResults() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<StageEntry[]>([]);
  const lastStageRef = useRef<string | null>(null);

  // Reset history when navigating between jobs.
  useEffect(() => {
    setJob(null);
    setStages([]);
    lastStageRef.current = null;
  }, [jobId]);

  // Append to history whenever the backend reports a new stage label.
  useEffect(() => {
    if (!job?.stage) return;
    if (job.stage === lastStageRef.current) return;
    lastStageRef.current = job.stage;
    setStages((prev) => [
      ...prev,
      { stage: job.stage!, progress: job.progress, at: Date.now() },
    ]);
  }, [job?.stage, job?.progress]);

  // Initial load (non-silent → triggers progress bar).
  useEffect(() => {
    if (!jobId) return;
    fetchJob(jobId)
      .then(setJob)
      .catch(() => setError("Could not load job"));
  }, [jobId]);

  // Background polling — silent so the bar isn't constantly flashing.
  const polling = !!jobId && !error && (!job || job.status === "pending" || job.status === "running");
  usePolling(async () => {
    if (!jobId) return;
    const data = await fetchJob(jobId, { silent: true });
    setJob(data);
  }, 2500, polling);

  if (error) return (
    <div className="container route-fade" style={{ color: "var(--bad)" }}>{error}</div>
  );

  if (!job) return (
    <div className="container route-fade">
      <Skeleton height={20} width="20%" style={{ marginBottom: 24 }} />
      <Skeleton height={40} width="40%" style={{ marginBottom: 12 }} />
      <Skeleton height={14} width="30%" style={{ marginBottom: 32 }} />
      <Skeleton height={120} radius={16} />
    </div>
  );

  const isRunning = job.status === "pending" || job.status === "running";
  const cls = STATUS_CLASS[job.status] ?? "";
  const canSave = job.status === "completed";

  return (
    <div className="container route-fade">

      <div className="row row--gap-2" style={{ marginBottom: 24, fontSize: 14 }}>
        <Link to="/" className="mute" style={{ textDecoration: "none" }}>Jobs</Link>
        <span className="dim">›</span>
        <span className="mute mono">{job.job_id.slice(0, 8)}</span>
      </div>

      <div className="row row--between" style={{ marginBottom: 32, alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">{MODEL_LABEL[job.model_type] ?? job.model_type}</h1>
          <div className="page-sub">
            {job.genome} · {job.chromosome} · {new Date(job.created_at).toLocaleString()}
          </div>
        </div>
        <div className={`badge badge--lg ${cls}`}>{job.status}</div>
      </div>

      {isRunning && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="row row--between" style={{ marginBottom: 10 }}>
            <span className="mute" style={{ fontSize: 14 }}>
              {job.stage ?? "Queued — waiting for a worker…"}
            </span>
            <span style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600 }}>
              {Math.round(job.progress * 100)}%
            </span>
          </div>
          <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.round(job.progress * 100)}%`,
              background: "linear-gradient(90deg, var(--accent-deep), var(--accent))",
              borderRadius: 3, transition: "width 0.4s ease",
            }} />
          </div>

          {stages.length > 0 && <StageLog stages={stages} />}
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div className="card" style={{
          marginBottom: 28,
          color: "var(--bad)", borderColor: "var(--bad)", background: "rgba(248,113,113,0.08)",
          fontSize: 14,
        }}>
          {job.error}
        </div>
      )}

      {job.status === "completed" && job.metrics && (
        <>
          <IgvViewer jobId={job.job_id} genome={job.genome} chromosome={job.chromosome} />

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="section-label" style={{ margin: "0 0 24px" }}>Results</h2>
            <MetricsDisplay metrics={job.metrics} />
          </div>

          <div className="card">
            <div className="row row--between row--wrap" style={{ gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  Export predictions
                </div>
                <div className="mute text-sm">
                  {job.metrics.n_highconf_regions.toLocaleString()} high-confidence regions · bedGraph format
                </div>
              </div>
              <div className="row row--gap-3 row--wrap">
                {canSave && <SaveToLibraryForm jobId={job.job_id} />}
                <a className="btn btn--success btn--lg" href={exportUrl(job.job_id)} download>
                  Download BedGraph
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
