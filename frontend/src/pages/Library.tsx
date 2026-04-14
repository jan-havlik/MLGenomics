import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLibrary,
  deleteLibraryModel,
  exportLibraryUrl,
  importLibraryModel,
  runLibraryPredict,
  patchLibraryModel,
  LibraryModelInfo,
} from "../api/client";

const MODEL_LABEL: Record<string, string> = {
  xgboost:          "XGBoost",
  random_forest:    "Random Forest",
  isolation_forest: "Isolation Forest",
};

const MODEL_COLOR: Record<string, string> = {
  xgboost:          "#0ea5e9",
  random_forest:    "#a78bfa",
  isolation_forest: "#fb923c",
};

function TagBadge({ tag }: { tag: string }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 12,
      background: "rgba(148,163,184,0.1)", border: "1px solid #334155",
      fontSize: 12, color: "#94a3b8",
    }}>
      {tag}
    </span>
  );
}

function ModelCard({
  model,
  onDeleted,
  onRenamed,
}: {
  model: LibraryModelInfo;
  onDeleted: () => void;
  onRenamed: (updated: LibraryModelInfo) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(model.display_name);
  const color = MODEL_COLOR[model.model_type] ?? "#94a3b8";

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteLibraryModel(model.name);
    onDeleted();
  };

  const handlePredict = async () => {
    setPredicting(true);
    try {
      const { job_id } = await runLibraryPredict(model.name);
      navigate(`/jobs/${job_id}`);
    } catch {
      setPredicting(false);
    }
  };

  const handleRename = async () => {
    if (nameValue === model.display_name) { setEditingName(false); return; }
    const updated = await patchLibraryModel(model.name, { display_name: nameValue });
    onRenamed(updated);
    setEditingName(false);
  };

  return (
    <div style={{
      background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
      padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16,
    }}>
      {/* Top row: name + model badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingName(false); }}
                style={{
                  flex: 1, padding: "6px 10px", background: "#0f172a",
                  border: "1px solid #0ea5e9", borderRadius: 8,
                  color: "#e2e8f0", fontSize: 16, fontWeight: 600,
                }}
              />
              <button onClick={handleRename} style={{ padding: "6px 14px", background: "#0369a1", borderRadius: 8, color: "#e2e8f0", border: "none", fontSize: 13, cursor: "pointer" }}>Save</button>
              <button onClick={() => setEditingName(false)} style={{ padding: "6px 12px", background: "transparent", borderRadius: 8, color: "#64748b", border: "1px solid #334155", fontSize: 13, cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {model.display_name}
              </h3>
              <button
                onClick={() => setEditingName(true)}
                title="Rename"
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "2px 4px", lineHeight: 1 }}
              >
                ✎
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#475569", fontFamily: "monospace", marginTop: 4 }}>{model.name}</div>
        </div>
        <div style={{
          padding: "4px 14px", borderRadius: 20, flexShrink: 0,
          background: `${color}22`, border: `1px solid ${color}55`,
          fontSize: 12, fontWeight: 600, color,
        }}>
          {MODEL_LABEL[model.model_type] ?? model.model_type}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {model.auc != null && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", lineHeight: 1 }}>
              {model.auc.toFixed(3)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>AUC</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", lineHeight: 1 }}>
            {model.n_features}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Features</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", lineHeight: 1 }}>
            {model.chromosome}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Chromosome</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {new Date(model.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Description */}
      {model.description && (
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{model.description}</div>
      )}

      {/* Tags */}
      {model.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {model.tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid #0f172a" }}>
        <button
          onClick={handlePredict}
          disabled={predicting}
          style={{
            padding: "10px 22px", background: "#0369a1",
            borderRadius: 8, color: "#e2e8f0", border: "none",
            fontSize: 14, fontWeight: 600, cursor: predicting ? "not-allowed" : "pointer",
            opacity: predicting ? 0.7 : 1,
          }}
        >
          {predicting ? "Running…" : "Run Predictions"}
        </button>
        <a
          href={exportLibraryUrl(model.name)}
          download
          style={{
            padding: "10px 20px", background: "transparent",
            border: "1px solid #334155", borderRadius: 8,
            color: "#94a3b8", textDecoration: "none",
            fontSize: 14, fontWeight: 500,
          }}
        >
          Export Bundle
        </a>
        <button
          onClick={handleDelete}
          style={{
            marginLeft: "auto", padding: "10px 18px", background: "transparent",
            border: `1px solid ${confirming ? "#f87171" : "#334155"}`,
            borderRadius: 8, color: confirming ? "#f87171" : "#475569",
            fontSize: 14, cursor: "pointer",
          }}
          onMouseLeave={() => setConfirming(false)}
        >
          {confirming ? "Confirm delete?" : "Delete"}
        </button>
      </div>
    </div>
  );
}

export default function Library() {
  const [models, setModels] = useState<LibraryModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const data = await fetchLibrary();
    setModels(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportErr(null);
    try {
      await importLibraryModel(file);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setImportErr(msg ?? "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 2rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            Model Library
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
            Saved models for instant predictions — no retraining needed
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {importing && <span style={{ fontSize: 14, color: "#64748b" }}>Importing…</span>}
          {importErr && <span style={{ fontSize: 13, color: "#f87171" }}>{importErr}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={handleImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              padding: "11px 22px", background: "transparent",
              border: "1px solid #334155", borderRadius: 10, color: "#94a3b8",
              fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}
          >
            + Import Bundle
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "#64748b", fontSize: 15 }}>Loading…</div>
      ) : models.length === 0 ? (
        <div style={{
          background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
          padding: "48px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧬</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>
            No models saved yet
          </div>
          <div style={{ fontSize: 14, color: "#64748b", maxWidth: 400, margin: "0 auto" }}>
            Train a job, then click "Save to Library" on the results page to add it here. Or import a model bundle below.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {models.map((m) => (
            <ModelCard
              key={m.name}
              model={m}
              onDeleted={() => setModels((prev) => prev.filter((x) => x.name !== m.name))}
              onRenamed={(updated) => setModels((prev) => prev.map((x) => x.name === m.name ? updated : x))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
