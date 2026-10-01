/** What the platform team should look at, worked out from facts about each restaurant. Pure, so it can be tested. */

export type AttentionKind =
  | "TILL_FAILING" | "ORDERS_STUCK" | "ORDERS_FAILED" | "NO_OWNER"
  | "SYNC_FAILING" | "STALE_SYNC" | "NEVER_SYNCED" | "NO_TILL" | "TILL_DISABLED";

/** problem: customers or staff are affected now. warning: it will become one. setup: not finished being set up. */
export type Severity = "problem" | "warning" | "setup";

export interface RestaurantFacts {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  tpapi: {
    isEnabled: boolean;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastSyncAt: Date | null;
    lastErrorMessage: string | null;
  } | null;
  activeOwners: number;
  /** Orders still waiting to reach the till after STUCK_AFTER_MIN minutes. */
  stuckOrders: number;
  /** Orders that failed in the last 24 hours. */
  failedOrders: number;
  /** How many of the newest menu syncs failed in a row (0 when the latest worked or none ran), and why. */
  syncFailures?: number;
  lastSyncError?: string | null;
}

export interface AttentionItem {
  restaurantId: string;
  slug: string;
  name: string;
  kind: AttentionKind;
  severity: Severity;
  message: string;
}

export const STUCK_AFTER_MIN = 10;
export const STALE_SYNC_DAYS = 3;
const DAY = 86_400_000;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const RANK: Record<Severity, number> = { problem: 0, warning: 1, setup: 2 };

/**
 * Only active restaurants are looked at: a suspended or archived one is switched off on purpose, so
 * nothing about it is "wrong". Worst first, then by name.
 */
export function buildAttention(restaurants: RestaurantFacts[], now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const r of restaurants) {
    if (r.status !== "ACTIVE") continue;
    const add = (kind: AttentionKind, severity: Severity, message: string) =>
      items.push({ restaurantId: r.id, slug: r.slug, name: r.name, kind, severity, message });
    const t = r.tpapi;

    if (r.stuckOrders > 0) {
      add("ORDERS_STUCK", "problem", `${plural(r.stuckOrders, "order has", "orders have")} been waiting over ${STUCK_AFTER_MIN} minutes to reach the till.`);
    }
    if (r.failedOrders > 0) {
      add("ORDERS_FAILED", "problem", `${plural(r.failedOrders, "order", "orders")} failed in the last 24 hours.`);
    }
    if (r.activeOwners === 0) {
      add("NO_OWNER", "problem", "Nobody can sign in to its back office: there is no active owner.");
    }

    if (!t) {
      add("NO_TILL", "setup", "No till connection yet.");
      continue;
    }
    if (!t.isEnabled) {
      add("TILL_DISABLED", "setup", "The till connection is switched off.");
      continue;
    }

    const ok = t.lastSuccessAt?.getTime() ?? null;
    const bad = t.lastFailureAt?.getTime() ?? null;
    if (bad !== null && (ok === null || bad > ok)) {
      add("TILL_FAILING", "problem", `The till link is failing${t.lastErrorMessage ? `: ${t.lastErrorMessage}` : "."}`);
      continue;   // a menu that cannot be read is the same problem, said once
    }

    if ((r.syncFailures ?? 0) > 0) {
      const n = r.syncFailures!;
      // A few failures in a row can be a blip; three or more means the menu is not being kept up to date.
      add("SYNC_FAILING", n >= 3 ? "problem" : "warning",
        `The last ${n === 1 ? "menu update" : `${n} menu updates`} from the till failed${r.lastSyncError ? `: ${r.lastSyncError}` : "."} The kiosk keeps showing the previous menu.`);
      continue;
    }

    if (!t.lastSyncAt) {
      add("NEVER_SYNCED", "setup", "The menu has never been read from the till.");
    } else if (now - t.lastSyncAt.getTime() > STALE_SYNC_DAYS * DAY) {
      const days = Math.floor((now - t.lastSyncAt.getTime()) / DAY);
      add("STALE_SYNC", "warning", `The menu was last read from the till ${days} days ago. Price or product changes in unTill have not reached the kiosk.`);
    }
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.name.localeCompare(b.name));
}
