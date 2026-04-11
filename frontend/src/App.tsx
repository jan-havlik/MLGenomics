import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchJobs, deleteJob, JobListItem } from "./api/client";
import NewJob from "./pages/NewJob";
import JobResults from "./pages/JobResults";

const statusColor: Record<string, string> = {
  pending: "#f59e0b",
  running: "#38bdf8",
  completed: "#34d399",
  failed: "#f87171",
};

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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", margin: 0 }}>Genomics ML Portal</h1>
        <Link to="/new" style={{
          padding: "9px 20px", background: "#0284c7", borderRadius: 8,
          color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600,
        }}>
          + New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "4rem 2rem",
          color: "#475569", border: "1px dashed #1e293b", borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧬</div>
          <div style={{ fontSize: 16, marginBottom: 6 }}>No jobs yet</div>
          <div style={{ fontSize: 13 }}>Upload a BED file to train your first classifier.</div>
          <Link to="/new" style={{
            display: "inline-block", marginTop: 16, padding: "8px 20px",
            background: "#0284c7", borderRadius: 8, color: "#fff",
            textDecoration: "none", fontSize: 13,
          }}>
            Start here
          </Link>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Job ID", "Model", "Chromosome", "Status", "AUC", "Created", ""].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontSize: 12, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr
                key={j.job_id}
                onClick={() => navigate(`/jobs/${j.job_id}`)}
                style={{ borderBottom: "1px solid #1e293b", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={td}><span style={{ fontFamily: "monospace", fontSize: 12 }}>{j.job_id.slice(0, 8)}</span></td>
                <td style={td}>{j.model_type.replace(/_/g, " ")}</td>
                <td style={td}>{j.chromosome}</td>
                <td style={td}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12, fontSize: 12,
                    color: statusColor[j.status] || "#e2e8f0",
                    border: `1px solid ${statusColor[j.status] || "#334155"}`,
                  }}>
                    {j.status}
                  </span>
                </td>
                <td style={td}>{j.auc != null ? j.auc.toFixed(3) : "—"}</td>
                <td style={td}>{new Date(j.created_at).toLocaleString()}</td>
                <td style={td}>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteJob(j.job_id).then(load); }}
                    style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}
                    title="Delete"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const td: React.CSSProperties = { padding: "12px", fontSize: 13, color: "#cbd5e1" };

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JobList />} />
      <Route path="/new" element={<NewJob />} />
      <Route path="/jobs/:jobId" element={<JobResults />} />
    </Routes>
  );
}
