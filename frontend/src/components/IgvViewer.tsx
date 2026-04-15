import { useEffect, useRef, useState } from "react";

interface IgvViewerProps {
  jobId: string;
  chromosome: string;
}

export default function IgvViewer({ jobId, chromosome }: IgvViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browserRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    // igv.js is large — load it dynamically so it doesn't bloat the initial bundle
    import("igv").then((igvModule) => {
      if (cancelled || !containerRef.current) return;

      const igv = igvModule.default ?? igvModule;

      igv.createBrowser(containerRef.current, {
        genome: "hg38",
        locus: `${chromosome}:5,000,000-15,000,000`,
        tracks: [
          {
            name: "Predictions",
            url: `${window.location.origin}/api/jobs/${jobId}/export`,
            format: "bedgraph" as never,
            type: "wig",
            color: "#0ea5e9",
            autoscale: true,
            height: 80,
          },
        ],
      })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((browser: any) => {
          if (cancelled) {
            igv.removeBrowser(browser);
            return;
          }
          browserRef.current = browser;
          setLoading(false);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }).catch((e: Error) => {
      if (!cancelled) setError(e.message);
    });

    return () => {
      cancelled = true;
      if (browserRef.current) {
        try {
          // igv.removeBrowser expects the browser instance
          import("igv").then((m) => {
            const igv = m.default ?? m;
            igv.removeBrowser(browserRef.current);
          });
        } catch {
          // ignore cleanup errors
        }
        browserRef.current = null;
      }
    };
  }, [jobId, chromosome]);

  return (
    <div style={{
      background: "#1e293b", borderRadius: 16, border: "1px solid #334155",
      padding: "24px 32px", marginBottom: 24,
    }}>
      <h2 style={{
        fontSize: 12, fontWeight: 600, color: "#94a3b8",
        margin: "0 0 20px", textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        Genome Browser
      </h2>

      {loading && !error && (
        <div style={{ color: "#64748b", fontSize: 14, marginBottom: 12 }}>
          Loading IGV…
        </div>
      )}

      {error && (
        <div style={{ color: "#f87171", fontSize: 14 }}>
          Could not load genome browser: {error}
        </div>
      )}

      {/* IGV mounts into this div */}
      <div
        ref={containerRef}
        style={{
          borderRadius: 8, overflow: "hidden",
          display: error ? "none" : "block",
        }}
      />
    </div>
  );
}
