import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname } = useLocation();

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      height: 64,
      background: "rgba(15, 23, 42, 0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #1e293b",
      display: "flex", alignItems: "center",
      padding: "0 2rem",
    }}>
      {/* Logo */}
      <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, marginRight: 40 }}>
        <span style={{ fontSize: 22 }}>🧬</span>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#e2e8f0", letterSpacing: "-0.3px" }}>
          Genomics ML Portal
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {[{ to: "/", label: "Jobs" }, { to: "/new", label: "New Job" }].map(({ to, label }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link key={to} to={to} style={{
              padding: "6px 14px", borderRadius: 8,
              textDecoration: "none", fontSize: 14, fontWeight: 500,
              color: active ? "#e2e8f0" : "#64748b",
              background: active ? "#1e293b" : "transparent",
              transition: "all 0.15s",
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* CTA */}
      <Link to="/new" style={{
        padding: "8px 20px", borderRadius: 8,
        background: "#0284c7", color: "#fff",
        textDecoration: "none", fontSize: 14, fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        + New Job
      </Link>
    </nav>
  );
}
