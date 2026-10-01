"use client";

import { useState } from "react";
import type { RestaurantTab } from "@/lib/platform";
import { useAuth } from "@/state/auth";
import OverviewPage from "./OverviewPage";
import RestaurantPage from "./RestaurantPage";
import RestaurantsPage from "./RestaurantsPage";
import { ErrorText, input, primary } from "./ui";

export default function Shell() {
  const { user, loading, signIn, signOut, canWrite } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"overview" | "restaurants">("overview");
  // A restaurant that is open, and the tab to open it on.
  const [open, setOpen] = useState<{ id: string; tab?: RestaurantTab } | null>(null);
  const go = (v: "overview" | "restaurants") => { setView(v); setOpen(null); };

  if (loading) return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Loading…</main>;

  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try { await signIn(form.email.trim(), form.password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
          className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8"
        >
          <h1 className="text-2xl font-semibold">Platform admin</h1>
          <p className="mb-6 mt-1 text-sm text-(--color-ink-muted)">For the platform team. Restaurants sign in to their own back office.</p>

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="email">Email</label>
          <input id="email" type="email" required value={form.email} autoComplete="username" className={input + " mb-4"}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="password">Password</label>
          <input id="password" type="password" required value={form.password} autoComplete="current-password" className={input + " mb-6"}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />

          <div className="mb-4"><ErrorText message={error} /></div>
          <button type="submit" disabled={busy} className={primary + " w-full"}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b border-(--color-line) bg-(--color-surface-2) px-8 py-3">
        <span className="text-lg font-semibold">Platform admin</span>
        <nav className="flex gap-1" aria-label="Sections">
          {([["overview", "Overview"], ["restaurants", "Restaurants"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => go(v)} aria-current={view === v ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${view === v ? "bg-(--color-brand) text-(--color-brand-ink)" : "hover:bg-(--color-surface)"}`}>{label}</button>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-4 text-sm text-(--color-ink-muted)">
          <span>{user.email} · {user.role === "SUPER_ADMIN" ? "super admin" : "support (read-only)"}</span>
          <button onClick={signOut} className="underline">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-8">
        {open
          ? <RestaurantPage key={`${open.id}:${open.tab ?? ""}`} id={open.id} canWrite={canWrite} initialTab={open.tab} onBack={() => setOpen(null)} />
          : view === "overview"
            ? <OverviewPage onOpen={(id, tab) => setOpen({ id, tab })} />
            : <RestaurantsPage canWrite={canWrite} onOpen={(id) => setOpen({ id })} />}
      </main>
    </div>
  );
}
