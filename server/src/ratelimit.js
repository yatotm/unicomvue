const WINDOW_MS = 60 * 60_000;

// 单进程固定窗口；容量耗尽时拒绝新键，不能通过挤掉旧记录绕过限流。
export function createRateLimiter({ now = () => Date.now(), windowMs = WINDOW_MS, maxKeys = 10_000 } = {}) {
  const hits = new Map();
  let nextPruneAt = 0;

  function prune(currentTime) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= currentTime) hits.delete(key);
    }
  }

  return {
    take(key, limit) {
      if (!Number.isFinite(limit) || limit <= 0) return true;

      const currentTime = now();
      if (currentTime >= nextPruneAt) {
        prune(currentTime);
        nextPruneAt = currentTime + Math.min(windowMs, 60_000);
      }
      const entry = hits.get(key);

      if (!entry || entry.resetAt <= currentTime) {
        if (!entry && hits.size >= maxKeys) return false;
        hits.set(key, { count: 1, resetAt: currentTime + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;

      entry.count += 1;
      return true;
    },
  };
}
