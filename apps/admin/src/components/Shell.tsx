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
import { AppFrame, ThemeButton, type NavGroup } from "./frame";
import { ErrorText } from "./ui";

type View = "overview" | "restaurants" | "team" | "account";

const LABELS = { menu: "Menu", fold: "Fold the menu", signOut: "Sign out", theme: "Light / dark theme", close: "Close" };

/** The NEXBORN logo on its white tile, for the pages before signing in. */
const Logo = () => (
  <span className="self-start rounded-(--radius-card) border border-(--color-line) bg-white px-4 py-3">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/brand/nexborn-logo.png" alt="NEXBORN – The Next Generation of Restaurant Technology" className="h-auto w-[200px]" />
  </span>
);

export default function Shell() {
  const { user, loading, signIn, signOut, canWrite, reload } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [view, setView] = useState<View>("overview");
  // A restaurant that is open, and the tab to open it on.
  const [open, setOpen] = useState<{ id: string; tab?: RestaurantTab; filter?: string } | null>(null);
  const go = (v: View) => { setView(v); setOpen(null); };
  // The next person to sign in on this screen starts at the beginning, not on the last person's page.
  const leave = async () => { await signOut(); setView("overview"); setOpen(null); };

  if (loading) return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Loading…</main>;

  if (!user && forgot) {
    return <main className="grid min-h-dvh place-items-center p-6"><ForgotPassword onBack={() => setForgot(false)} /></main>;
  }

  if (!user) {
    return (
      <main className="relative grid min-h-dvh place-items-center p-6">
        <div className="absolute end-4 top-4"><ThemeButton label={LABELS.theme} /></div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try { await signIn(form.email.trim(), form.password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
          className="card flex w-full max-w-sm flex-col gap-4 p-8"
        >
          <Logo />
          <div>
            <h1 className="text-[19px] font-bold">Platform admin</h1>
            <p className="mt-1 text-(--color-ink-muted)">For the NEXBORN team. Restaurants sign in to their own back office.</p>
          </div>

          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="field"
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="password">Password</label>
            <input id="password" type="password" required value={form.password} autoComplete="current-password" className="field"
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>

          <ErrorText message={error} />
          <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
          <button type="button" onClick={() => setForgot(true)} className="self-start text-[13px] text-(--color-brand) hover:underline">Forgot your password?</button>
        </form>
      </main>
    );
  }

  // A password someone else chose (a new account, or a reset) is only good for choosing your own.
  if (user.mustChangePassword) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="card flex w-full max-w-sm flex-col gap-4 p-8">
          <Logo />
          <div>
            <h1 className="text-[19px] font-bold">Choose your password</h1>
            <p className="mt-1 text-(--color-ink-muted)">You signed in with a temporary password. Choose your own before you continue.</p>
          </div>
          <ChangePasswordForm submitLabel="Save my password" onDone={() => void reload()} />
          <button onClick={leave} className="btn btn-ghost self-start">Sign out</button>
        </div>
      </main>
    );
  }

  const groups: NavGroup<View>[] = [
    { label: "Monitoring", items: [{ key: "overview", label: "Overview", icon: "dashboard" }] },
    { label: "Customers", items: [{ key: "restaurants", label: "Restaurants", icon: "store" }] },
    {
      label: "Administration",
      items: [
        ...(canWrite ? [{ key: "team" as const, label: "Admin team", icon: "users" as const }] : []),
        { key: "account", label: "My password", icon: "settings" },
      ],
    },
  ];
  // An open restaurant belongs to Restaurants, wherever it was opened from.
  const active: View = open ? "restaurants" : view;
  const current = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => i.key === active)!;

  return (
    <AppFrame groups={groups} active={active} onPick={go} title={current.label} crumb={open ? "Customers / Restaurant" : current.group}
      user={{ name: user.email.split("@")[0]!, detail: user.role === "SUPER_ADMIN" ? "Super admin" : "Support (read-only)" }}
      onSignOut={() => void leave()} labels={LABELS}
      topRight={!canWrite ? <span className="badge badge-warn">Read-only</span> : null}>
      {view === "account" && !open ? (
        <div className="card max-w-xl">
          <h2 className="card-title mb-1">Change password</h2>
          <p className="mb-4 text-(--color-ink-muted)">You will stay signed in here. Any other place you are signed in is signed out.</p>
          <ChangePasswordForm onDone={() => undefined} />
        </div>
      ) : view === "team" && !open && canWrite ? <TeamPage myId={user.id} />
      : open
        ? <RestaurantPage key={`${open.id}:${open.tab ?? ""}`} id={open.id} canWrite={canWrite} initialTab={open.tab} initialFilter={open.filter} onBack={() => setOpen(null)} />
        : view === "overview"
          ? <OverviewPage onOpen={(id, tab, filter) => setOpen({ id, tab, filter })} />
          : <RestaurantsPage canWrite={canWrite} onOpen={(id, tab) => setOpen({ id, tab })} />}
    </AppFrame>
  );
}
