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
        border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "1.75rem",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "rgba(56,189,248,0.06)" : "var(--surface-2)",
        transition: "all 150ms ease",
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
          <div style={{ fontSize: 14, color: "var(--accent)", marginBottom: 4 }}>{file.name}</div>
          <div className="text-xs dim">{(file.size / 1024).toFixed(1)} KB</div>
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            style={{
              marginTop: 8, fontSize: 12, color: "var(--bad)",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 22, marginBottom: 6, color: "var(--text-mute)" }}>+</div>
          <div className="mute" style={{ fontSize: 14 }}>
            Drop a BED file here or click to browse
          </div>
          <div className="dim text-xs" style={{ marginTop: 6 }}>
            {optional ? "Optional for Isolation Forest · " : ""}BED3+ format · max 50 MB
          </div>
        </div>
      )}
    </div>
  );
}
