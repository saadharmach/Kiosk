import { request } from "./api";

export type Status = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type UserRole = "OWNER" | "MANAGER" | "STAFF";

export interface PosHealth {
  isEnabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSyncAt: string | null;
}

export interface RestaurantRow {
  id: string;
  slug: string;
  name: string;
  status: Status;
  city: string | null;
  country: string | null;
  currency: string;
  timezone: string;
  createdAt: string;
  _count: { users: number; orders: number };
  tpapi: PosHealth | null;
}

export interface RestaurantDetail extends Omit<RestaurantRow, "_count"> {
  locale: string;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  primaryColor: string | null;
  _count: { kiosks: number; users: number; orders: number };
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; pages: number }

const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");

export const listRestaurants = (q: { q?: string; status?: string; page?: number }) =>
  request<Page<RestaurantRow>>(`/admin/restaurants?${qs({ q: q.q, status: q.status, page: q.page ? String(q.page) : undefined })}`);

export const getRestaurant = (id: string) => request<RestaurantDetail>(`/admin/restaurants/${id}`);

export interface NewRestaurant {
  slug: string; name: string; currency?: string; locale?: string; timezone?: string;
  contactEmail?: string; contactPhone?: string; addressLine?: string; city?: string; country?: string; primaryColor?: string;
}
export const createRestaurant = (body: NewRestaurant) =>
  request<RestaurantRow>("/admin/restaurants", { method: "POST", body: JSON.stringify(body) });

export type RestaurantEdit = Partial<NewRestaurant> & { status?: Status };
export const updateRestaurant = (id: string, body: RestaurantEdit) =>
  request<RestaurantRow>(`/admin/restaurants/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// ------------------------------------------------------------- unTill connection

export interface Connection {
  host: string; port: number; useTls: boolean; soapPath: string; wsdlPath: string; appName: string; timeoutMs: number;
  isEnabled: boolean; hasCredentials: boolean;
  lastSuccessAt: string | null; lastFailureAt: string | null; lastErrorMessage: string | null;
  lastLatencyMs: number | null; lastSyncAt: string | null;
}
export const getConnection = (id: string) => request<Connection>(`/admin/restaurants/${id}/tpapi`);

export interface ConnectionForm {
  host: string; port: number; useTls: boolean; isEnabled: boolean; appName?: string;
  userName?: string; password?: string; appToken?: string;
}
export const saveConnection = (id: string, body: ConnectionForm) =>
  request<unknown>(`/admin/restaurants/${id}/tpapi`, { method: "PUT", body: JSON.stringify(body) });

export interface TestResult { ok: boolean; endpoint: string; durationMs: number; version?: string; message?: string; error?: string }
export const testConnection = (id: string) =>
  request<TestResult>(`/admin/restaurants/${id}/tpapi/test`, { method: "POST" });

export interface SyncRun {
  id: string; status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED"; trigger: string;
  startedAt: string; finishedAt: string | null; durationMs: number | null; errorMessage: string | null;
}
export const syncRuns = (id: string) => request<SyncRun[]>(`/admin/restaurants/${id}/sync-runs`);
export interface SyncSchedule { enabled: boolean; intervalMin: number; nextAt: string | null }
export const syncSchedule = (id: string) => request<SyncSchedule>(`/admin/restaurants/${id}/sync-schedule`);
export const runSync = (id: string) => request<SyncRun>(`/admin/restaurants/${id}/sync`, { method: "POST" });

// ------------------------------------------------------------------------ users

export interface RestaurantUser {
  id: string; email: string; fullName: string | null; role: UserRole; isActive: boolean;
  lastLoginAt: string | null; lockedUntil: string | null; createdAt: string;
}
export const listUsers = (id: string) => request<RestaurantUser[]>(`/admin/restaurants/${id}/users`);
export const createUser = (id: string, body: { email: string; role: UserRole; fullName?: string }) =>
  request<{ user: RestaurantUser; temporaryPassword: string }>(`/admin/restaurants/${id}/users`, { method: "POST", body: JSON.stringify(body) });
export const updateUser = (id: string, userId: string, body: { isActive?: boolean; role?: UserRole; fullName?: string }) =>
  request<RestaurantUser>(`/admin/restaurants/${id}/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) });
export const resetPassword = (id: string, userId: string) =>
  request<{ temporaryPassword: string }>(`/admin/restaurants/${id}/users/${userId}/reset-password`, { method: "POST" });

// --------------------------------------------------------------------- activity

export interface ActivityItem {
  id: string; at: string; actorType: string; actor: string | null; action: string; entityType: string; entityId: string | null;
}
export const listActivity = (id: string, page = 1) => request<Page<ActivityItem>>(`/admin/restaurants/${id}/activity?page=${page}`);

// ------------------------------------------------------------------------- team

export type TeamRole = "SUPER_ADMIN" | "SUPPORT";
export interface TeamMember {
  id: string; email: string; fullName: string | null; role: TeamRole; isActive: boolean;
  lastLoginAt: string | null; lockedUntil: string | null; mustChangePassword: boolean; createdAt: string;
}
export const listTeam = () => request<TeamMember[]>("/admin/team");
export const createTeamMember = (body: { email: string; role: TeamRole; fullName?: string }) =>
  request<{ user: TeamMember; temporaryPassword: string }>("/admin/team", { method: "POST", body: JSON.stringify(body) });
export const updateTeamMember = (id: string, body: { isActive?: boolean; role?: TeamRole; fullName?: string }) =>
  request<TeamMember>(`/admin/team/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const resetTeamPassword = (id: string) => request<{ temporaryPassword: string }>(`/admin/team/${id}/reset-password`, { method: "POST" });
export const teamActivity = () => request<{ id: string; at: string; action: string; actor: string; target: string | null }[]>("/admin/team/activity");

/** The new-password rule: long enough to matter, and typed the same twice. Returns what is wrong, or null. */
export function passwordProblem(next: string, again: string, current: string): string | null {
  if (next.length < 12) return "The new password must be at least 12 characters.";
  if (next !== again) return "The two new passwords are not the same.";
  if (next === current) return "The new password must be different from the current one.";
  return null;
}

// ---------------------------------------------------------------------- overview

export type AttentionKind =
  | "TILL_FAILING" | "ORDERS_STUCK" | "ORDERS_FAILED" | "NO_OWNER"
  | "SYNC_FAILING" | "STALE_SYNC" | "NEVER_SYNCED" | "NO_TILL" | "TILL_DISABLED";
export type Severity = "problem" | "warning" | "setup";

export interface AttentionItem { restaurantId: string; slug: string; name: string; kind: AttentionKind; severity: Severity; message: string }

export interface Overview {
  generatedAt: string;
  restaurants: { ACTIVE: number; SUSPENDED: number; ARCHIVED: number; total: number };
  orders: { last24h: number; last7d: number };
  attention: AttentionItem[];
  recentActivity: { id: string; at: string; restaurantId: string | null; restaurant: string | null; actor: string | null; action: string }[];
}
export const getOverview = () => request<Overview>("/admin/overview");

export type RestaurantTab = "Go-live" | "Details" | "unTill" | "Users" | "Orders" | "Till log" | "Activity";

export const KIOSK_URL = process.env.NEXT_PUBLIC_KIOSK_URL ?? "http://localhost:3002";
export const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "http://localhost:3003";

// ---------------------------------------------------------------------- orders

export type OrderStatus = "DRAFT" | "PENDING" | "SENT" | "CONFIRMED" | "PAID" | "FAILED" | "CANCELLED";

export interface OrderRow {
  id: string; reference: string; status: OrderStatus; orderType: string; tableNumber: number | null;
  itemCount: number; total: number; currency: string; createdAt: string; sentAt: string | null; tpapiLastError: string | null;
}
export interface OrderItem {
  lineNumber: number; parentLineNumber: number | null; kind: string; articleName: string; displayName: string | null;
  sizeName: string | null; optionGroupName: string | null; quantity: number; unitPrice: number; lineTotal: number; text: string | null;
}
export interface OrderDetail {
  id: string; reference: string; status: OrderStatus; orderType: string; tableNumber: number | null; currency: string;
  total: number; itemCount: number; createdAt: string; sentAt: string | null; confirmedAt: string | null;
  tpapi: { attempts: number; returnCode: number | null; lastError: string | null; correlationId: string | null };
  items: OrderItem[];
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; actor: string; reason: string | null; createdAt: string }[];
}

/** What "needs a look" means in an order list: not yet at the till, waiting for it, or refused by it. */
export const NEEDS_ATTENTION = "PENDING,SENT,FAILED";

export const listOrders = (id: string, q: { status?: string; reference?: string; page?: number }) =>
  request<{ orders: OrderRow[]; total: number; page: number; pages: number }>(
    `/admin/restaurants/${id}/orders?${qs({ status: q.status, reference: q.reference, page: q.page ? String(q.page) : undefined })}`);
export const getOrder = (id: string, orderId: string) => request<OrderDetail>(`/admin/restaurants/${id}/orders/${orderId}`);
export const verifyOrder = (id: string, orderId: string) =>
  request<{ reference: string; confirmed?: boolean; unreachable?: boolean }>(`/admin/restaurants/${id}/orders/${orderId}/verify`, { method: "POST" });
export const retryOrder = (id: string, orderId: string) =>
  request<unknown>(`/admin/restaurants/${id}/orders/${orderId}/retry`, { method: "POST" });

export interface TillLogItem {
  id: string; at: string; operation: string | null; ok: boolean; level: string; returnCode: number | null;
  message: string | null; durationMs: number | null; orderReference: string | null;
}
export const listTillLog = (id: string, page = 1, failuresOnly = false) =>
  request<Page<TillLogItem>>(`/admin/restaurants/${id}/till-log?page=${page}&failures=${failuresOnly}`);

// ------------------------------------------------------------------- go-live checklist

export type CheckState = "done" | "todo" | "warning";
export interface Check {
  key: string; label: string; required: boolean; state: CheckState; detail: string;
  /** Present when the platform team can fix it here; absent when only the restaurant can, in its own back office. */
  tab?: "Details" | "unTill" | "Users";
}
export interface Readiness {
  ready: boolean; requiredDone: number; requiredTotal: number; recommendedDone: number; recommendedTotal: number; checks: Check[];
}
export const getReadiness = (id: string) => request<Readiness>(`/admin/restaurants/${id}/readiness`);

/** Where to take someone who clicks a finding: the tab where it can be looked at or fixed. */
export function tabFor(kind: AttentionKind): RestaurantTab {
  switch (kind) {
    case "NO_OWNER": return "Users";
    case "TILL_FAILING": case "SYNC_FAILING": case "STALE_SYNC": case "NEVER_SYNCED": case "NO_TILL": case "TILL_DISABLED": return "unTill";
    case "ORDERS_STUCK": case "ORDERS_FAILED": return "Orders";
    default: return "Details";
  }
}

// ------------------------------------------------------------------- helpers

export type PosState = "NOT_SET_UP" | "DISABLED" | "FAILING" | "CONNECTED" | "UNTESTED";

/** The one-word answer to "does this restaurant's till link work?", from what the API last recorded. */
export function posState(t: PosHealth | null): PosState {
  if (!t) return "NOT_SET_UP";
  if (!t.isEnabled) return "DISABLED";
  const ok = t.lastSuccessAt ? Date.parse(t.lastSuccessAt) : null;
  const bad = t.lastFailureAt ? Date.parse(t.lastFailureAt) : null;
  if (bad !== null && (ok === null || bad > ok)) return "FAILING";
  return ok !== null ? "CONNECTED" : "UNTESTED";
}

/** "3 min ago", "2 days ago": enough to judge whether a sync is recent. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
