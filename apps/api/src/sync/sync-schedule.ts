/** When is a restaurant's menu next due to be read from its till? Pure, so the rules can be tested. */

export interface SyncConfig {
  /** Minutes between menu reads when all is well. 0 turns automatic syncing off. */
  intervalMin: number;
  /** After a failure, the first retry waits this long; each further failure doubles it, up to intervalMin. */
  retryMin: number;
}

export interface RunFacts {
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: Date;
}

const MIN = 60_000;
/** A run still "RUNNING" after this long is taken to have died with the server. */
export const RUN_STALE_MIN = 10;

export function syncConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const read = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return { intervalMin: read(env.CATALOG_SYNC_INTERVAL_MIN, 60), retryMin: Math.max(1, read(env.CATALOG_SYNC_RETRY_MIN, 15)) };
}

/**
 * `runs` are this restaurant's recent runs, newest first, whoever started them: a manual sync counts, so
 * pressing the button resets the clock. Returns when the next automatic attempt is due, or null when it is
 * due right now (nothing has ever run, or the clock has run out). Never schedules while a sync is running.
 */
export function nextSyncAt(runs: RunFacts[], cfg: SyncConfig, now: number): Date | null {
  const newest = runs[0];
  if (!newest) return null;

  const started = newest.startedAt.getTime();
  const died = newest.status === "RUNNING" && now - started > RUN_STALE_MIN * MIN;
  if (newest.status === "RUNNING" && !died) return new Date(started + RUN_STALE_MIN * MIN);   // wait it out

  const failed = newest.status === "FAILED" || died;
  if (!failed) return new Date(started + cfg.intervalMin * MIN);

  let failures = 0;
  for (const r of runs) {
    const stale = r.status === "RUNNING" && now - r.startedAt.getTime() > RUN_STALE_MIN * MIN;
    if (r.status === "FAILED" || stale) failures++;
    else break;
  }
  const delayMin = Math.min(cfg.intervalMin, cfg.retryMin * 2 ** (failures - 1));
  return new Date(started + delayMin * MIN);
}

export const isSyncDue = (runs: RunFacts[], cfg: SyncConfig, now: number): boolean => {
  if (cfg.intervalMin <= 0) return false;
  const at = nextSyncAt(runs, cfg, now);
  return at === null || now >= at.getTime();
};

/** How many of the newest runs failed in a row. */
export function consecutiveFailures(runs: RunFacts[], now: number): number {
  let n = 0;
  for (const r of runs) {
    const stale = r.status === "RUNNING" && now - r.startedAt.getTime() > RUN_STALE_MIN * MIN;
    if (r.status === "FAILED" || stale) n++;
    else break;
  }
  return n;
}
