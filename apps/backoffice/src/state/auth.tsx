"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, me, refresh, setToken, type Me } from "@/lib/api";

interface AuthApi {
  user: Me | null;
  slug: string | null;
  loading: boolean;
  signIn: (slug: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);
const SLUG_KEY = "kiosk.backoffice.slug";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // A page reload loses the in-memory token; the refresh cookie restores the
  // session so staff aren't asked to sign in every time they hit F5.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await refresh();
      if (!cancelled && ok) {
        try {
          setUser(await me());
          setSlug(localStorage.getItem(SLUG_KEY));
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (s: string, email: string, password: string) => {
    await apiLogin(s, email, password);
    setUser(await me());
    setSlug(s);
    try { localStorage.setItem(SLUG_KEY, s); } catch { /* private mode */ }
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, slug, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}