/** The go-live checklist for one restaurant, worked out from facts about it. Pure, so it can be tested. */

export type CheckKey = "ACTIVE" | "TILL" | "MENU" | "ORDER_TYPES" | "OWNER" | "PRINTER" | "LOGO" | "TEST_ORDER";
/** done: fine. todo: not done yet. warning: works, but look at it. */
export type CheckState = "done" | "todo" | "warning";
/** Which screen can fix it: the platform admin's tabs, or only the restaurant in its own back office. */
export type FixTab = "Details" | "unTill" | "Users";

export interface Check {
  key: CheckKey;
  label: string;
  /** A required check that is still "todo" blocks going live. The others are recommended. */
  required: boolean;
  state: CheckState;
  detail: string;
  /** Present when the platform team can fix it; absent when the restaurant does it in its own back office. */
  tab?: FixTab;
}

export interface ReadinessFacts {
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  till: {
    isEnabled: boolean;
    hasCredentials: boolean;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastErrorMessage: string | null;
    lastSyncAt: Date | null;
  } | null;
  menu: { departments: number; articles: number; prices: number };
  /** Only the order types the restaurant has switched on. */
  orderTypes: { type: "EAT_IN" | "TAKE_AWAY" | "DELIVERY"; configured: boolean }[];
  activeOwners: number;
  /** null: no printer at all. */
  printer: { enabled: boolean; hasAddress: boolean; helperIssued: boolean; helperOnline: boolean } | null;
  hasLogo: boolean;
  /** Orders that reached the till and were confirmed there. */
  placedOrders: number;
}

export const STALE_MENU_DAYS = 3;
const DAY = 86_400_000;
const TYPE_LABEL = { EAT_IN: "Eat in", TAKE_AWAY: "Take away", DELIVERY: "Delivery" } as const;

export function evaluateReadiness(f: ReadinessFacts, now = Date.now()) {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // ---- the restaurant is switched on
  add(f.status === "ACTIVE"
    ? { key: "ACTIVE", label: "Restaurant is active", required: true, state: "done", detail: "Its kiosk and its staff sign-in are on.", tab: "Details" }
    : { key: "ACTIVE", label: "Restaurant is active", required: true, state: "todo", detail: `It is ${f.status.toLowerCase()}: its kiosk is off and its staff cannot sign in. Activate it when it is ready.`, tab: "Details" });

  // ---- the link to the till
  const t = f.till;
  const ok = t?.lastSuccessAt?.getTime() ?? null;
  const bad = t?.lastFailureAt?.getTime() ?? null;
  let till: Pick<Check, "state" | "detail">;
  if (!t) till = { state: "todo", detail: "No unTill connection yet. Add the host, port and credentials that unTill gave you for this restaurant." };
  else if (!t.hasCredentials) till = { state: "todo", detail: "The connection has no credentials stored yet." };
  else if (!t.isEnabled) till = { state: "todo", detail: "The connection is switched off." };
  else if (bad !== null && (ok === null || bad > ok)) till = { state: "todo", detail: `The till did not answer${t.lastErrorMessage ? `: ${t.lastErrorMessage}` : "."} Check the details and press Test connection.` };
  else if (ok === null) till = { state: "todo", detail: "Saved but never tested. Press Test connection." };
  else till = { state: "done", detail: "The till answered the last test." };
  add({ key: "TILL", label: "Connected to the till", required: true, tab: "unTill", ...till });

  // ---- the menu has been read, and there is something to sell
  const m = f.menu;
  let menu: Pick<Check, "state" | "detail">;
  if (!t?.lastSyncAt) menu = { state: "todo", detail: "The menu has not been read from the till yet. Press Sync now." };
  else if (m.articles === 0 || m.departments === 0) menu = { state: "todo", detail: "The menu was read but came back empty: no products or no departments." };
  else if (m.prices === 0) menu = { state: "todo", detail: "The menu has products but no prices for this restaurant's price level." };
  else if (now - t.lastSyncAt.getTime() > STALE_MENU_DAYS * DAY) {
    const days = Math.floor((now - t.lastSyncAt.getTime()) / DAY);
    menu = { state: "warning", detail: `${m.articles} products, last read ${days} days ago. Changes made in unTill since then are not on the kiosk. Press Sync now to refresh.` };
  } else menu = { state: "done", detail: `${m.articles} products in ${m.departments} departments.` };
  add({ key: "MENU", label: "Menu read from the till", required: true, tab: "unTill", ...menu });

  // ---- at least one way of ordering that the kiosk will really offer
  const ready = f.orderTypes.filter((o) => o.configured);
  const notReady = f.orderTypes.filter((o) => !o.configured);
  let types: Pick<Check, "state" | "detail">;
  if (f.orderTypes.length === 0) types = { state: "todo", detail: "No way of ordering is switched on. The restaurant turns one on in its back office, under Settings." };
  else if (ready.length === 0) types = { state: "todo", detail: `${notReady.map((o) => TYPE_LABEL[o.type]).join(", ")} ${notReady.length === 1 ? "is" : "are"} switched on but not set up (a sales area and a table source are missing). The restaurant sets this in its back office, under Settings.` };
  else if (notReady.length > 0) types = { state: "warning", detail: `${ready.map((o) => TYPE_LABEL[o.type]).join(", ")} ready. ${notReady.map((o) => TYPE_LABEL[o.type]).join(", ")} ${notReady.length === 1 ? "is" : "are"} switched on but not set up, so customers will not see ${notReady.length === 1 ? "it" : "them"}.` };
  else types = { state: "done", detail: `${ready.map((o) => TYPE_LABEL[o.type]).join(", ")} ready.` };
  add({ key: "ORDER_TYPES", label: "Ways of ordering are set up", required: true, ...types });

  // ---- someone can sign in to the back office
  add(f.activeOwners > 0
    ? { key: "OWNER", label: "An owner can sign in", required: true, state: "done", detail: `${f.activeOwners} active owner${f.activeOwners === 1 ? "" : "s"}.`, tab: "Users" }
    : { key: "OWNER", label: "An owner can sign in", required: true, state: "todo", detail: "No active owner yet. Add one on the Users tab and pass on the temporary password.", tab: "Users" });

  // ---- recommended: tickets, logo, and proof that an order really goes through
  const p = f.printer;
  let printer: Pick<Check, "state" | "detail">;
  if (!p) printer = { state: "todo", detail: "No ticket printer yet. The restaurant sets one up in its back office, under Printer." };
  else if (!p.enabled || !p.hasAddress) printer = { state: "todo", detail: "A printer exists but is switched off or has no address." };
  else if (!p.helperIssued) printer = { state: "todo", detail: "The printer is set up but the print helper has no secret yet, so nothing can print." };
  else if (!p.helperOnline) printer = { state: "warning", detail: "Set up. The print helper is not running right now, so tickets wait until it starts." };
  else printer = { state: "done", detail: "Set up, and the print helper is running." };
  add({ key: "PRINTER", label: "Ticket printer", required: false, ...printer });

  add(f.hasLogo
    ? { key: "LOGO", label: "Logo", required: false, state: "done", detail: "The kiosk shows the restaurant's logo." }
    : { key: "LOGO", label: "Logo", required: false, state: "todo", detail: "No logo yet. The restaurant adds it in its back office, under Settings." });

  add(f.placedOrders > 0
    ? { key: "TEST_ORDER", label: "An order has gone through the till", required: false, state: "done", detail: `${f.placedOrders} order${f.placedOrders === 1 ? "" : "s"} confirmed by the till.` }
    : { key: "TEST_ORDER", label: "An order has gone through the till", required: false, state: "todo", detail: "Place a test order on the kiosk and check that it appears on the till." });

  const required = checks.filter((c) => c.required);
  return {
    // Ready means nothing required is still to do. A warning is worth a look but does not block.
    ready: required.every((c) => c.state !== "todo"),
    requiredDone: required.filter((c) => c.state !== "todo").length,
    requiredTotal: required.length,
    recommendedDone: checks.filter((c) => !c.required && c.state === "done").length,
    recommendedTotal: checks.filter((c) => !c.required).length,
    checks,
  };
}
