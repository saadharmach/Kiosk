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

export type RestaurantEdit = Partial<Omit<NewRestaurant, "slug">> & { status?: Status };
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

export type RestaurantTab = "Go-live" | "Details" | "unTill" | "Users" | "Activity";

export const KIOSK_URL = process.env.NEXT_PUBLIC_KIOSK_URL ?? "http://localhost:3002";
export const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "http://localhost:3003";

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
