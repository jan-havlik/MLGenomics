import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { JobMetrics } from "../api/client";

interface Props {
  metrics: JobMetrics;
  featureImportance: Record<string, number> | null;
}

const badge = (label: string, value: string, color: string) => (
  <div style={{
    background: "#1e293b", border: `1px solid ${color}`,
    borderRadius: 8, padding: "12px 20px", textAlign: "center", minWidth: 130,
  }}>
    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
  </div>
);

export default function MetricsDisplay({ metrics, featureImportance }: Props) {
  const top15 = featureImportance
    ? Object.entries(featureImportance)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, val]) => ({ name, value: +(val * 100).toFixed(2) }))
    : [];

  return (
    <div>
      {/* Score badges */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {metrics.auc !== null && badge("ROC-AUC", metrics.auc.toFixed(3), "#38bdf8")}
        {metrics.ap !== null && badge("Avg Precision", metrics.ap.toFixed(3), "#34d399")}
        {badge("CV AUC", `${metrics.cv_auc_mean.toFixed(3)} ±${metrics.cv_auc_std.toFixed(3)}`, "#a78bfa")}
        {badge("Positives", metrics.n_positives.toLocaleString(), "#fb923c")}
        {badge("Negatives", metrics.n_negatives.toLocaleString(), "#64748b")}
        {badge("High-conf regions", metrics.n_highconf_regions.toLocaleString(), "#f472b6")}
      </div>

      {/* Feature importance */}
      {top15.length > 0 && (
        <div>
          <h3 style={{ color: "#cbd5e1", marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
            Feature Importance (top 15)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={top15}
              layout="vertical"
              margin={{ left: 120, right: 20, top: 0, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} unit="%" />
              <YAxis
                type="category" dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }} width={115}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Importance"]}
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top15.map((_, i) => (
                  <Cell key={i} fill={`hsl(${200 + i * 8}, 70%, 55%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
