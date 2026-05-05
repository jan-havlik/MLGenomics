import { useEffect, useRef, useState } from "react";
import {
  CacheStatus,
  CacheUsage,
  ChromosomeInfo,
  GenomeInfo,
  fetchCacheStatus,
  fetchCacheUsage,
  fetchChromosomes,
  fetchGenomes,
  prepareCache,
} from "../api/client";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

interface Props {
  genome: string;
  chromosome: string;
  onChange: (genome: string, chromosome: string) => void;
  onReady: (ready: boolean) => void;
}

export default function GenomePicker({ genome, chromosome, onChange, onReady }: Props) {
  const [genomes, setGenomes] = useState<GenomeInfo[]>([]);
  const [chromosomes, setChromosomes] = useState<ChromosomeInfo[]>([]);
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  const refreshUsage = () => {
    fetchCacheUsage({ silent: true }).then(setUsage).catch(() => undefined);
  };

  useEffect(() => {
    fetchGenomes().then(setGenomes);
    refreshUsage();
  }, []);

  useEffect(() => {
    fetchChromosomes(genome).then(setChromosomes);
  }, [genome]);

  // Reset transient UI state when the user picks a different chromosome.
  useEffect(() => {
    setPreparing(false);
    setError(null);
  }, [genome, chromosome]);

  // All polling lives inside this effect so the interval is bound to the
  // currently-selected (genome, chromosome). Switching chromosomes cancels
  // the old poller; navigating back to an in-flight extraction picks up
  // where it left off.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStatus(null);

    const stopPolling = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const handleStatus = (s: CacheStatus): boolean => {
      if (cancelled) return true;
      setStatus(s);
      if (s.cached || s.status === "completed") {
        onReady(true);
        setPreparing(false);
        fetchChromosomes(genome).then((cs) => {
          if (!cancelled) setChromosomes(cs);
        });
        refreshUsage();
        return true;
      }
      if (s.status === "failed") {
        setPreparing(false);
        setError(s.error || "Extraction failed");
        return true;
      }
      if (s.status === "running") {
        setPreparing(true);
      }
      return false;
    };

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await fetchCacheStatus(genome, chromosome, { silent: true });
          if (handleStatus(s)) stopPolling();
        } catch {
          // swallow — keep polling, transient errors recover on next tick
        }
      }, 2000);
    };

    fetchCacheStatus(genome, chromosome, { silent: true })
      .then((s) => {
        const terminal = handleStatus(s);
        if (!terminal && s.status === "running") {
          // Extraction was started by us or someone else — resume polling.
          startPolling();
        } else if (!terminal) {
          onReady(s.cached);
        }
      })
      .catch(() => {
        if (!cancelled) onReady(false);
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genome, chromosome, refreshTick]);

  const handlePrepare = async () => {
    setError(null);
    setPreparing(true);
    try {
      await prepareCache(genome, chromosome);
      // Re-run the deps effect, which will see status="running" and start polling.
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setPreparing(false);
      setError(e instanceof Error ? e.message : "Failed to start extraction");
    }
  };

  const isReady = status?.cached === true;
  const progress = status?.progress ?? 0;
  const stage = status?.stage ?? null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row row--gap-3" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="dim text-xs" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Genome
          </span>
          <select
            className="input input--sm"
            value={genome}
            onChange={(e) => onChange(e.target.value, chromosomes[0]?.name || "chr21")}
            style={{ minWidth: 220 }}
          >
            {genomes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="dim text-xs" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Chromosome
          </span>
          <select
            className="input input--sm"
            value={chromosome}
            onChange={(e) => onChange(genome, e.target.value)}
            style={{ minWidth: 140 }}
          >
            {chromosomes.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} {c.cached ? "✓" : ""}
              </option>
            ))}
          </select>
        </label>

        <div style={{ flex: 1, minWidth: 200 }}>
          {isReady ? (
            <span className="dim text-xs" style={{ color: "var(--good, #22c55e)" }}>
              ✓ Cached and ready
            </span>
          ) : preparing || status?.status === "running" ? (
            <div>
              <div className="dim text-xs" style={{ marginBottom: 4 }}>
                {stage || "Preparing…"} ({Math.round(progress * 100)}%)
              </div>
              <div style={{
                height: 4, background: "var(--border-soft)", borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.round(progress * 100)}%`,
                  background: "var(--accent)",
                  transition: "width 300ms ease",
                }} />
              </div>
            </div>
          ) : (
            <button
              className="btn btn--ghost btn--sm"
              onClick={handlePrepare}
              disabled={preparing}
            >
              Prepare data (fetch from UCSC, ~1–3 min)
            </button>
          )}
          {error && (
            <div className="text-xs" style={{ color: "var(--bad)", marginTop: 6 }}>
              {error}
            </div>
          )}
        </div>
      </div>
      <p className="dim text-xs" style={{ marginTop: 10 }}>
        First use of a chromosome triggers a one-time download from UCSC goldenPath and feature
        extraction. The result is cached for all future jobs.
      </p>

      {usage && (
        <div style={{ marginTop: 10 }}>
          <div className="row row--between dim text-xs" style={{ marginBottom: 4 }}>
            <span>
              Cache: {formatBytes(usage.used_bytes)} / {formatBytes(usage.max_bytes)}
            </span>
            <span>{Math.round(usage.fraction * 100)}%</span>
          </div>
          <div style={{
            height: 3, background: "var(--border-soft)", borderRadius: 2,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, Math.round(usage.fraction * 100))}%`,
              background: usage.fraction > 0.9 ? "var(--bad)" : "var(--accent)",
              transition: "width 300ms ease",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
