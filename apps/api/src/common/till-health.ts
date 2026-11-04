/**
 * Can the restaurant's till (unTill) be reached right now? The server pings it every TILL_PING_SEC seconds
 * (TillWatchService). While it does not answer, the kiosks show "no connection" and take no orders: an order the
 * till cannot receive would reach nobody in the kitchen.
 */

/** How often each till is pinged. */
export const TILL_PING_SEC = Number(process.env.TILL_WATCH_INTERVAL_SEC ?? 30);
/** Failed pings in a row before the kiosks stop: one lost answer is not an outage. */
export const TILL_DOWN_AFTER = 2;
/** How long one ping may take: a till that slow cannot take an order either. */
export const TILL_PING_TIMEOUT_MS = 10_000;

/**
 * The kiosk's view. No connection set up, or switched off by the platform team: no till to send orders to, so the
 * kiosk does not take them either (a connection never set up already shows "menu not read").
 */
export function tillReachable(t: { isEnabled: boolean; pingFailures: number } | null | undefined): boolean {
  return Boolean(t && t.isEnabled && t.pingFailures < TILL_DOWN_AFTER);
}
