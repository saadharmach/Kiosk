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
