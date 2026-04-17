import { useEffect, useRef } from "react";

/**
 * Invokes `fn` immediately, then every `intervalMs`.
 * Pauses while the tab is hidden so free-tier hosts don't burn requests on
 * inactive sessions. `active` lets the caller stop polling (e.g. once a job
 * reaches a terminal state).
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  active: boolean = true,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          await fnRef.current();
        } catch {
          // ignore — caller handles errors
        }
      }
      timer = setTimeout(tick, intervalMs);
    };

    tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Resume immediately with a fresh fetch instead of waiting for timer.
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, active]);
}
