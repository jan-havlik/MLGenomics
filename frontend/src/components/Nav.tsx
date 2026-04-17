import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/",        label: "Jobs"    },
  { to: "/library", label: "Library" },
  { to: "/new",     label: "New Job" },
];

export default function Nav() {
  const { pathname } = useLocation();

  return (
    <nav className="nav">
      <Link to="/" className="nav__brand">
        <span style={{ fontSize: 20 }}>🧬</span>
        <span className="nav__brand-text">Genomics ML Portal</span>
      </Link>

      <div className="nav__links">
        {LINKS.map(({ to, label }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`nav__link ${active ? "nav__link--active" : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <Link to="/new" className="nav__cta">+ New Job</Link>
    </nav>
  );
}
