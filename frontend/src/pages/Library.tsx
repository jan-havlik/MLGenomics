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
import { Skeleton } from "../components/Skeleton";

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
    <div className="card col col--gap-4">
      <div className="row row--between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div className="row row--gap-2">
              <input
                autoFocus
                className="input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingName(false); }}
                style={{ fontSize: 16, fontWeight: 600 }}
              />
              <button className="btn btn--primary btn--sm" onClick={handleRename}>Save</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditingName(false)}>×</button>
            </div>
          ) : (
            <div className="row row--gap-2">
              <h3 style={{
                margin: 0, fontSize: 18, fontWeight: 700,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {model.display_name}
              </h3>
              <button
                onClick={() => setEditingName(true)}
                title="Rename"
                style={{ background: "none", border: "none", color: "var(--text-fade)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
              >
                ✎
              </button>
            </div>
          )}
          <div className="mono text-xs dim" style={{ marginTop: 4 }}>{model.name}</div>
        </div>
        <div className="badge" style={{
          flexShrink: 0,
          background: `${color}22`, borderColor: `${color}55`, color,
        }}>
          {MODEL_LABEL[model.model_type] ?? model.model_type}
        </div>
      </div>

      <div className="row row--wrap" style={{ gap: 24 }}>
        {model.auc != null && <Stat value={model.auc.toFixed(3)} label="AUC" />}
        <Stat value={String(model.n_features)} label="Features" />
        <Stat value={model.chromosome} label="Chromosome" />
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="text-xs dim">{new Date(model.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      {model.description && (
        <div className="mute" style={{ fontSize: 14, lineHeight: 1.6 }}>{model.description}</div>
      )}

      {model.tags.length > 0 && (
        <div className="row row--wrap" style={{ gap: 6 }}>
          {model.tags.map((t) => <span key={t} className="badge">{t}</span>)}
        </div>
      )}

      <div className="row row--wrap" style={{ gap: 10, paddingTop: 4, borderTop: "1px solid var(--surface-2)" }}>
        <button className="btn btn--primary" onClick={handlePredict} disabled={predicting}>
          {predicting ? "Running…" : "Run Predictions"}
        </button>
        <a className="btn btn--ghost" href={exportLibraryUrl(model.name)} download>
          Export Bundle
        </a>
        <button
          className={`btn ${confirming ? "btn--danger" : "btn--ghost"}`}
          style={{ marginLeft: "auto" }}
          onClick={handleDelete}
          onMouseLeave={() => setConfirming(false)}
        >
          {confirming ? "Confirm delete?" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div className="text-xs dim" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
        {label}
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
    <div className="container route-fade">
      <div className="row row--between row--wrap" style={{ marginBottom: 32, gap: 16 }}>
        <div>
          <h1 className="page-title">Model Library</h1>
          <p className="page-sub">Saved models for instant predictions — no retraining needed</p>
        </div>
        <div className="row row--gap-3">
          {importing && <span className="mute text-sm">Importing…</span>}
          {importErr && <span style={{ color: "var(--bad)", fontSize: 13 }}>{importErr}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={handleImport}
          />
          <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            + Import Bundle
          </button>
        </div>
      </div>

      {loading ? (
        <div className="col col--gap-4">
          <Skeleton height={180} radius={16} />
          <Skeleton height={180} radius={16} />
        </div>
      ) : models.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🧬</div>
          <div className="empty__title">No models saved yet</div>
          <div className="empty__msg">
            Train a job, then click "Save to Library" on the results page to add it here. Or import a model bundle above.
          </div>
        </div>
      ) : (
        <div className="col col--gap-4">
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
