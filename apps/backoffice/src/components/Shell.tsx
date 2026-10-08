"use client";

import { useState } from "react";
import ForgotPassword from "./ForgotPassword";
import { useAuth } from "@/state/auth";
import ProductsPage from "./ProductsPage";
import CategoriesPage from "./CategoriesPage";
import AllergensPage from "./AllergensPage";
import SettingsPage from "./SettingsPage";
import OrdersPage from "./OrdersPage";
import BornesPage from "./BornesPage";
import SuggestionsPage from "./SuggestionsPage";
import BrandingPage from "./BrandingPage";
import SubscriptionBanner from "./SubscriptionBanner";
const SECTIONS = ["Products", "Categories", "Suggestions", "Allergens", "Orders", "Bornes", "Branding", "Settings"] as const;

export default function Shell() {
  const { user, slug, loading, signIn, signOut } = useAuth();
  const [form, setForm] = useState({ slug: "", email: "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Products");

  if (loading) {
    return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Loading…</main>;
  }

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
            try {
              // Phone keyboards capitalise the first letter; the restaurant address and the email are never case sensitive.
              await signIn(form.slug.trim().toLowerCase(), form.email.trim().toLowerCase(), form.password);
            } catch (err) {
              // The API gives one answer for every kind of mismatch, on purpose; say what to check.
              const m = (err as Error).message;
              setError(m === "Invalid credentials" ? "Wrong restaurant address, email or password. Check all three: the address is the short one (like resto-a), not the restaurant's name." : m);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8"
        >
          <h1 className="mb-6 text-2xl font-semibold">Back office</h1>

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="slug">Restaurant address</label>
          <input id="slug" required value={form.slug} autoComplete="organization" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="mb-1 h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
          <p className="mb-4 text-xs text-(--color-ink-muted)">The short address of your restaurant (for example resto-a), not its display name. Ask the platform admin if you do not know it.</p>

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="email">Email</label>
          <input id="email" type="email" required value={form.email} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="mb-4 h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="password">Password</label>
          <input id="password" type="password" required value={form.password} autoComplete="current-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mb-6 h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />

          {error ? <p className="mb-4 text-sm text-(--color-danger)">{error}</p> : null}

          <button type="submit" disabled={busy}
            className="h-11 w-full rounded-lg bg-(--color-brand) font-medium text-(--color-brand-ink) disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => setForgot(true)} className="mt-4 text-sm underline">Forgot your password?</button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col border-e border-(--color-line) bg-(--color-surface-2) p-4">
        <p className="mb-6 px-2 text-sm text-(--color-ink-muted)">{slug}</p>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button key={s} onClick={() => setSection(s)} aria-current={s === section ? "page" : undefined}
              className={`h-10 rounded-lg px-3 text-start ${
                s === section ? "bg-(--color-brand) text-(--color-brand-ink)" : "hover:bg-(--color-surface)"
              }`}>
              {s}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-6 text-sm text-(--color-ink-muted)">
          <p className="truncate">{user.email}</p>
          <button onClick={signOut} className="mt-2 underline">Sign out</button>
        </div>
      </aside>

        <main className="flex-1 overflow-x-auto p-8">
          {slug ? (
            <SubscriptionBanner slug={slug} onClosed={(message) => { setError(message); void signOut(); }} />
          ) : null}
          <h1 className="mb-6 text-2xl font-semibold">{section}</h1>
          {section === "Products" && slug ? <ProductsPage slug={slug} />
          : section === "Categories" && slug ? <CategoriesPage slug={slug} />
          : section === "Suggestions" && slug ? <SuggestionsPage slug={slug} />
          : section === "Allergens" && slug ? <AllergensPage slug={slug} />
          : section === "Orders" && slug ? <OrdersPage slug={slug} />
          : section === "Bornes" && slug ? <BornesPage slug={slug} />
          : section === "Branding" && slug ? <BrandingPage slug={slug} />
          : section === "Settings" && slug ? <SettingsPage slug={slug} />
          : <p className="text-(--color-ink-muted)">Coming in the next step.</p>}
        </main>
    </div>
  );
}