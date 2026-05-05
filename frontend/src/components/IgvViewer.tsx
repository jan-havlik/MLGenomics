import { useEffect, useRef, useState } from "react";

interface IgvViewerProps {
  jobId: string;
  genome: string;
  chromosome: string;
}

export default function IgvViewer({ jobId, genome, chromosome }: IgvViewerProps) {
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
        genome,
        locus: `${chromosome}:5,000,000-15,000,000`,
        tracks: [
          {
            name: "Predictions",
            url: `${window.location.origin}/api/jobs/${jobId}/export.bw`,
            format: "bigwig" as never,
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
  }, [jobId, genome, chromosome]);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 className="section-label">Genome Browser</h2>

      {error && (
        <div style={{ color: "var(--bad)", fontSize: 14 }}>
          Could not load genome browser: {error}
        </div>
      )}

      {/* Container must stay in the layout (visible, non-zero width) so igv.js
          can measure it on createBrowser. We overlay a loading shimmer above it
          while the chunk + tracks are still fetching.

          IGV is a light-themed widget — gene tracks and the right-side gear
          gutter use white backgrounds. Letting them sit on the dark card
          makes them look like rendering glitches. We give the IGV mount its
          own light surface so the whole widget reads as one embedded panel. */}
      <div style={{ position: "relative", minHeight: 160 }}>
        <div className="igv-frame">
          <div
            ref={containerRef}
            style={{
              display: error ? "none" : "block",
              minHeight: 160,
            }}
          />
        </div>
        {loading && !error && (
          <div
            className="skeleton"
            style={{
              position: "absolute", inset: 0,
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-mute)", fontSize: 13,
              pointerEvents: "none",
            }}
          >
            Loading genome browser…
          </div>
        )}
      </div>
    </div>
  );
}
