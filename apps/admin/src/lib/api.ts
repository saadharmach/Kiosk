export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
export const setToken = (t: string | null) => { accessToken = t; };

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
    if (await refresh()) return request<T>(path, init, false);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (Array.isArray(body?.message) ? body.message.join(", ") : body?.message) ?? `Request failed with ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** Platform accounts only: these are not restaurant logins. */
export async function login(email: string, password: string) {
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.message ?? "Sign in failed", res.status);
  setToken(body.accessToken);
}

export async function refresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/auth/refresh", { method: "POST" });
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
  await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
  setToken(null);
}

export interface Me { id: string; email: string; fullName: string | null; role: "SUPER_ADMIN" | "SUPPORT" }
export const me = () => request<Me>("/admin/auth/me");
