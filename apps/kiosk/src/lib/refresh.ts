/**
 * When the kiosk reloads what it shows after the restaurant changed something (back office, admin, a menu sync).
 *
 * Never in the middle of someone's order: on the welcome screen (or a screen that is already an error, or says the
 * restaurant is unavailable) at once; otherwise it waits until the kiosk is back on the welcome screen.
 */
export type RefreshDecision = "now" | "later" | "no";

export function decideRefresh(a: { known: string | null; latest: string | null; screen: string; problem: boolean }): RefreshDecision {
  if (!a.latest || a.latest === a.known) return "no";
  return a.screen === "WELCOME" || a.problem ? "now" : "later";
}

/** How often the kiosk asks whether something changed. */
export const VERSION_POLL_MS = 20_000;
