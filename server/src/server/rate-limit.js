/**
 * Per-key sliding-window request limit plus a cap on concurrent requests.
 * In-memory: correct for a single server instance. Running several instances
 * needs a shared store (e.g. Redis) instead.
 */
export function createRateLimiter({ requestsPerMinute, maxConcurrent, now = Date.now }) {
  const windows = new Map(); // key -> timestamps of recent requests
  const inFlight = new Map(); // key -> count

  return {
    /**
     * Returns { ok: true, release } or { ok: false, retryAfterSeconds, reason }.
     * Call release() exactly once when the request finishes.
     */
    acquire(key) {
      const t = now();
      const recent = (windows.get(key) || []).filter((ts) => t - ts < 60_000);

      if ((inFlight.get(key) || 0) >= maxConcurrent) {
        windows.set(key, recent);
        return { ok: false, retryAfterSeconds: 1, reason: "too many concurrent requests" };
      }
      if (recent.length >= requestsPerMinute) {
        windows.set(key, recent);
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (t - recent[0])) / 1000)),
          reason: "request rate limit exceeded",
        };
      }

      recent.push(t);
      windows.set(key, recent);
      inFlight.set(key, (inFlight.get(key) || 0) + 1);

      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          const n = (inFlight.get(key) || 1) - 1;
          if (n <= 0) inFlight.delete(key);
          else inFlight.set(key, n);
        },
      };
    },
  };
}
