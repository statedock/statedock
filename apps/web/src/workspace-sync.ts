// Automatic ticks share an active request. Explicit refreshes queue one fresh pass
// so a mutation completed during a read is reflected before its caller returns.
export function createRefreshRunner() {
  const jobs = new Map<string, { active: Promise<void>; queued?: Promise<void> }>();
  return function run(key: string, action: () => Promise<void>, automatic = false): Promise<void> {
    const existing = jobs.get(key);
    if (existing) {
      if (automatic) return existing.active;
      if (!existing.queued)
        existing.queued = existing.active.catch(() => {}).then(() => run(key, action));
      return existing.queued;
    }
    const job = { active: Promise.resolve() } as { active: Promise<void>; queued?: Promise<void> };
    jobs.set(key, job);
    job.active = Promise.resolve()
      .then(action)
      .finally(() => {
        if (jobs.get(key) === job) jobs.delete(key);
      });
    return job.active;
  };
}

export function freshCached<T>(
  entry: { value: T; at: number } | undefined,
  now: number,
  ttl: number,
): T | undefined {
  return entry && now - entry.at < ttl ? entry.value : undefined;
}

// Keep browser notifications independent: only workspace/detail reads pause.
export function startVisiblePolling(
  refresh: () => Promise<void>,
  page: Document = document,
  host: Window = window,
) {
  const poll = () => {
    if (page.visibilityState === "visible") void refresh().catch(() => {});
  };
  poll();
  const timer = host.setInterval(poll, 5000);
  page.addEventListener("visibilitychange", poll);
  host.addEventListener("focus", poll);
  return () => {
    host.clearInterval(timer);
    page.removeEventListener("visibilitychange", poll);
    host.removeEventListener("focus", poll);
  };
}
