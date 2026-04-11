import { useRef, useState, DragEvent } from "react";

interface Props {
  file: File | null;
  onChange: (f: File | null) => void;
  optional?: boolean;
}

export default function BedUpload({ file, onChange, optional }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onChange(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? "#38bdf8" : "#334155"}`,
        borderRadius: 8,
        padding: "2rem",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "#0f2a3d" : "#1e293b",
        transition: "all 0.15s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".bed,.txt"
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div>
          <div style={{ fontSize: 14, color: "#38bdf8", marginBottom: 4 }}>{file.name}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {(file.size / 1024).toFixed(1)} KB
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            style={{
              marginTop: 8, fontSize: 12, color: "#f87171",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 24, marginBottom: 8 }}>+</div>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>
            Drop a BED file here or click to browse
          </div>
          <div style={{ color: "#475569", fontSize: 12, marginTop: 6 }}>
            {optional ? "Optional for Isolation Forest · " : ""}BED3+ format · max 50 MB
          </div>
        </div>
      )}
    </div>
  );
}
