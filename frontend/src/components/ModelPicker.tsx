interface ModelParams {
  n_estimators: number;
  max_depth: number;
}

interface Props {
  modelType: string;
  params: ModelParams;
  onChange: (type: string, params: ModelParams) => void;
}

const MODELS = [
  { id: "xgboost", label: "XGBoost", desc: "Gradient-boosted trees — best AUC, slower" },
  { id: "random_forest", label: "Random Forest", desc: "Ensemble of decision trees — fast, robust" },
  { id: "isolation_forest", label: "Isolation Forest", desc: "Unsupervised anomaly detection — no labels needed" },
];

export default function ModelPicker({ modelType, params, onChange }: Props) {
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id, params)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `2px solid ${modelType === m.id ? "#38bdf8" : "#334155"}`,
              background: modelType === m.id ? "#0f2a3d" : "#1e293b",
              color: modelType === m.id ? "#e2e8f0" : "#94a3b8",
              cursor: "pointer",
              textAlign: "left",
              minWidth: 200,
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {modelType !== "isolation_forest" && (
        <div style={{ display: "flex", gap: 24 }}>
          <label style={labelStyle}>
            <span>Trees (n_estimators)</span>
            <input
              type="number"
              value={params.n_estimators}
              min={50} max={1000} step={50}
              onChange={(e) => onChange(modelType, { ...params, n_estimators: +e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span>Max depth</span>
            <input
              type="number"
              value={params.max_depth}
              min={3} max={20}
              onChange={(e) => onChange(modelType, { ...params, max_depth: +e.target.value })}
              style={inputStyle}
            />
          </label>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4,
  fontSize: 13, color: "#94a3b8",
};

const inputStyle: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155",
  color: "#e2e8f0", borderRadius: 6, padding: "4px 8px",
  width: 100, fontSize: 13,
};
