import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { onLoadingChange } from "../api/client";

/**
 * Lightweight top progress bar.
 * - Activates on every route change.
 * - Activates while any axios request is in flight.
 * - Hides when no work is pending.
 */
export default function TopProgress() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    setActive(true);
    const t = setTimeout(() => setActive(false), 380);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => onLoadingChange(setRequests), []);

  const visible = active || requests > 0;

  return (
    <div className={`top-bar ${!visible ? "top-bar--done" : ""}`}>
      <div
        className="top-bar__fill"
        style={{ width: visible ? "85%" : "100%" }}
      />
    </div>
  );
}
