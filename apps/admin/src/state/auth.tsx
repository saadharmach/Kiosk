"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, me, refresh, setToken, type Me } from "@/lib/api";

interface AuthApi {
  user: Me | null;
  loading: boolean;
  /** Only a SUPER_ADMIN may change anything; SUPPORT can look and run a sync. */
  canWrite: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Asks the server who this is now (after choosing a password, say). */
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // A reload loses the in-memory token; the refresh cookie restores the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await refresh()) {
        try { if (!cancelled) setUser(await me()); } catch { setToken(null); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    setUser(await me());
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const reload = useCallback(async () => { setUser(await me()); }, []);

  return <Ctx.Provider value={{ user, loading, canWrite: user?.role === "SUPER_ADMIN", signIn, signOut, reload }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
