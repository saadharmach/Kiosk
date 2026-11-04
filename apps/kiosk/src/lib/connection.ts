/**
 * Can the kiosk take orders right now? Two things must work: its own internet (to reach our server), and our
 * server's connection to the restaurant's till (unTill). When either is missing the kiosk shows "no connection"
 * over whatever it was doing (the order is kept underneath) and carries on by itself once it is back.
 */
export type ConnectionState = "ok" | "no-internet" | "no-till";

/** Unanswered checks in a row before the kiosk says it has no internet: one slow answer is not an outage. */
export const OFFLINE_AFTER_FAILURES = 2;
/** How often the kiosk looks again while it has no connection, so it is back quickly. */
export const OFFLINE_POLL_MS = 5_000;

export function connectionState(a: { browserOnline: boolean; failedPolls: number; tillOk: boolean }): ConnectionState {
  // The browser knows at once when the cable or the Wi-Fi goes; the failed checks catch the rest (Wi-Fi without internet).
  if (!a.browserOnline || a.failedPolls >= OFFLINE_AFTER_FAILURES) return "no-internet";
  if (!a.tillOk) return "no-till";
  return "ok";
}
