import { useMemo } from "react";
import { FeatureInfo } from "../api/client";

interface Props {
  features: FeatureInfo[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function FeatureSelector({ features, selected, onChange }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, FeatureInfo[]>();
    for (const f of features) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group)!.push(f);
    }
    return map;
  }, [features]);

  const allNames = features.map((f) => f.name);
  const allSelected = selected.size === allNames.length;

  const toggleAll = () => {
    onChange(allSelected ? new Set() : new Set(allNames));
  };

  const toggleGroup = (group: string) => {
    const names = groups.get(group)!.map((f) => f.name);
    const allIn = names.every((n) => selected.has(n));
    const next = new Set(selected);
    if (allIn) names.forEach((n) => next.delete(n));
    else names.forEach((n) => next.add(n));
    onChange(next);
  };

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: "#94a3b8", fontSize: 13 }}>
          {selected.size} / {allNames.length} features selected
        </span>
        <button onClick={toggleAll} style={linkBtn}>
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      {[...groups.entries()].map(([group, fts]) => {
        const allIn = fts.every((f) => selected.has(f.name));
        return (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={allIn}
                onChange={() => toggleGroup(group)}
                style={{ accentColor: "#38bdf8" }}
              />
              <span style={{ fontWeight: 600, color: "#cbd5e1", fontSize: 13 }}>{group}</span>
            </div>
            <div style={{ paddingLeft: 20, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              {fts.map((f) => (
                <label key={f.name} title={f.description} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.name)}
                    onChange={() => toggle(f.name)}
                    style={{ accentColor: "#38bdf8" }}
                  />
                  {f.name}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "#38bdf8",
  cursor: "pointer", fontSize: 13, textDecoration: "underline",
};
