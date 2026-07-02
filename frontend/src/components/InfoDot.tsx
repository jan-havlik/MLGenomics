import { useState } from "react";

/**
 * Small "ⓘ" hover/click tooltip for inline help. Pure CSS/state, no deps.
 * `align` controls which edge the bubble anchors to, to avoid clipping at
 * the left/right of a row.
 */
export default function InfoDot({
  text,
  align = "center",
}: {
  text: string;
  align?: "left" | "center" | "right";
}) {
  const [show, setShow] = useState(false);

  const pos =
    align === "left"
      ? { left: 0, transform: "none" as const }
      : align === "right"
      ? { right: 0, transform: "none" as const }
      : { left: "50%", transform: "translateX(-50%)" as const };

  return (
    <span
      style={{ position: "relative", display: "inline-flex", marginLeft: 6, cursor: "help" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShow((s) => !s); }}
    >
      <span style={{
        width: 15, height: 15, borderRadius: "50%", border: "1px solid #475569",
        color: "#94a3b8", fontSize: 10, fontWeight: 700, lineHeight: "14px",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontStyle: "italic", fontFamily: "Georgia, serif",
      }}>i</span>
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", width: 250, ...pos,
            background: "#0b1220", border: "1px solid #334155", borderRadius: 8,
            padding: "10px 12px", fontSize: 12, lineHeight: 1.55, color: "#cbd5e1",
            textTransform: "none", letterSpacing: "normal", textAlign: "left",
            fontWeight: 400, zIndex: 30, pointerEvents: "none",
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)", whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
