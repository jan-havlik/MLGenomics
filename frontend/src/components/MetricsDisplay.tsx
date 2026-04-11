import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { JobMetrics } from "../api/client";

interface Props {
  metrics: JobMetrics;
  featureImportance: Record<string, number> | null;
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#0f172a", border: `1px solid ${color}22`,
      borderRadius: 12, padding: "18px 24px", textAlign: "center", flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

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
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
        {metrics.auc != null && <Badge label="ROC-AUC" value={metrics.auc.toFixed(3)} color="#38bdf8" />}
        {metrics.ap != null && <Badge label="Avg Precision" value={metrics.ap.toFixed(3)} color="#34d399" />}
        {metrics.cv_auc_mean != null && (
          <Badge
            label="CV AUC (5-fold)"
            value={`${metrics.cv_auc_mean.toFixed(3)} ±${(metrics.cv_auc_std ?? 0).toFixed(3)}`}
            color="#a78bfa"
          />
        )}
        <Badge label="Positives" value={(metrics.n_positives ?? 0).toLocaleString()} color="#fb923c" />
        <Badge label="Negatives" value={(metrics.n_negatives ?? 0).toLocaleString()} color="#64748b" />
        {metrics.n_highconf_regions != null && (
          <Badge label="High-conf regions" value={metrics.n_highconf_regions.toLocaleString()} color="#f472b6" />
        )}
      </div>

      {/* Feature importance */}
      {top15.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "#64748b",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16,
          }}>
            Feature Importance — top 15
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={top15}
              layout="vertical"
              margin={{ left: 10, right: 24, top: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 12 }}
                unit="%"
                axisLine={{ stroke: "#1e293b" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#e2e8f0", fontSize: 12 }}
                width={145}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                formatter={(v: number) => [`${v}%`, "Importance"]}
                contentStyle={{
                  background: "#0f172a", border: "1px solid #334155",
                  borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                }}
                labelStyle={{ color: "#e2e8f0", marginBottom: 4 }}
                itemStyle={{ color: "#94a3b8" }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {top15.map((_, i) => (
                  <Cell key={i} fill={`hsl(${200 + i * 9}, 65%, 58%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
