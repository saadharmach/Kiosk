export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
export const setToken = (t: string | null) => { accessToken = t; };
export const hasToken = () => accessToken !== null;

export async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  // Access tokens are short-lived; the refresh cookie renews silently once.
  if (res.status === 401 && retry && accessToken) {
    const renewed = await refresh();
    if (renewed) return request<T>(path, init, false);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ??
      `Request failed with ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export async function login(slug: string, email: string, password: string) {
  const res = await fetch("/api/restaurant/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.message ?? "Sign in failed", res.status);
  setToken(body.accessToken);
  return body as { accessToken: string };
}

export async function refresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/restaurant/auth/refresh", { method: "POST" });
    if (!res.ok) return false;
    const body = await res.json();
    if (!body?.accessToken) return false;
    setToken(body.accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function logout() {
  await fetch("/api/restaurant/auth/logout", { method: "POST" }).catch(() => undefined);
  setToken(null);
}

export interface Me { email: string; role: string; slug?: string }
export const me = () => request<Me>("/restaurant/auth/me");