"use client";

import { useState } from "react";
import type { RestaurantTab } from "@/lib/platform";
import { useAuth } from "@/state/auth";
import ChangePasswordForm from "./ChangePasswordForm";
import ForgotPassword from "./ForgotPassword";
import OverviewPage from "./OverviewPage";
import RestaurantPage from "./RestaurantPage";
import RestaurantsPage from "./RestaurantsPage";
import TeamPage from "./TeamPage";
import { ErrorText, input, primary } from "./ui";

export default function Shell() {
  const { user, loading, signIn, signOut, canWrite, reload } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [view, setView] = useState<"overview" | "restaurants" | "team" | "account">("overview");
  // A restaurant that is open, and the tab to open it on.
  const [open, setOpen] = useState<{ id: string; tab?: RestaurantTab; filter?: string } | null>(null);
  // On a phone the sections and the account links sit behind a Menu button.
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (v: "overview" | "restaurants" | "team" | "account") => { setView(v); setOpen(null); setMenuOpen(false); };
  // The next person to sign in on this screen starts at the beginning, not on the last person's page.
  const leave = async () => { await signOut(); setView("overview"); setOpen(null); };

  if (loading) return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Loading…</main>;

  if (!user && forgot) {
    return <main className="grid min-h-dvh place-items-center p-6"><ForgotPassword onBack={() => setForgot(false)} /></main>;
  }

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
          <input id="email" type="email" required value={form.email} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input + " mb-4"}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="password">Password</label>
          <input id="password" type="password" required value={form.password} autoComplete="current-password" className={input + " mb-6"}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />

          <div className="mb-4"><ErrorText message={error} /></div>
          <button type="submit" disabled={busy} className={primary + " w-full"}>{busy ? "Signing in…" : "Sign in"}</button>
          <button type="button" onClick={() => setForgot(true)} className="mt-4 text-sm underline">Forgot your password?</button>
        </form>
      </main>
    );
  }

  // A password someone else chose (a new account, or a reset) is only good for choosing your own.
  if (user.mustChangePassword) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8">
          <h1 className="text-2xl font-semibold">Choose your password</h1>
          <p className="mb-6 mt-1 text-sm text-(--color-ink-muted)">You signed in with a temporary password. Choose your own before you continue.</p>
          <ChangePasswordForm submitLabel="Save my password" onDone={() => void reload()} />
          <button onClick={leave} className="mt-6 text-sm underline">Sign out</button>
        </div>
      </main>
    );
  }

  const nav = ([["overview", "Overview"], ["restaurants", "Restaurants"], ["team", "Team"]] as const).filter(([v]) => v !== "team" || canWrite).map(([v, label]) => (
    <button key={v} onClick={() => go(v)} aria-current={view === v && !open ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-start text-sm md:py-1.5 ${view === v ? "bg-(--color-brand) text-(--color-brand-ink)" : "hover:bg-(--color-surface)"}`}>{label}</button>
  ));
  const account = (
    <>
      <span className="break-all">{user.email} · {user.role === "SUPER_ADMIN" ? "super admin" : "support (read-only)"}</span>
      <button onClick={() => go("account")} className="underline" aria-current={view === "account" ? "page" : undefined}>Change password</button>
      <button onClick={leave} className="underline">Sign out</button>
    </>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-(--color-line) bg-(--color-surface-2) md:static">
        <div className="flex h-14 items-center gap-4 px-4 md:px-8">
          <span className="text-lg font-semibold">Platform admin</span>
          <nav className="hidden gap-1 md:flex" aria-label="Sections">{nav}</nav>
          <div className="ms-auto hidden items-center gap-4 text-sm text-(--color-ink-muted) md:flex">{account}</div>
          <button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}
            className="ms-auto flex h-10 items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-surface) px-3 font-medium md:hidden">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
        {menuOpen ? (
          <div className="flex flex-col gap-4 border-t border-(--color-line) p-4 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Sections">{nav}</nav>
            <div className="flex flex-col items-start gap-3 text-sm text-(--color-ink-muted)">{account}</div>
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        {view === "account" && !open ? (
          <div>
            <h1 className="mb-1 text-2xl font-semibold">Change password</h1>
            <p className="mb-6 text-sm text-(--color-ink-muted)">You will stay signed in here. Any other place you are signed in is signed out.</p>
            <ChangePasswordForm onDone={() => undefined} />
          </div>
        ) : view === "team" && !open && canWrite ? <TeamPage myId={user.id} />
        : open
          ? <RestaurantPage key={`${open.id}:${open.tab ?? ""}`} id={open.id} canWrite={canWrite} initialTab={open.tab} initialFilter={open.filter} onBack={() => setOpen(null)} />
          : view === "overview"
            ? <OverviewPage onOpen={(id, tab, filter) => setOpen({ id, tab, filter })} />
            : <RestaurantsPage canWrite={canWrite} onOpen={(id, tab) => setOpen({ id, tab })} />}
      </main>
    </div>
  );
}
