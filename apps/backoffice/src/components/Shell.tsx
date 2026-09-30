"use client";

import { useState } from "react";
import { useAuth } from "@/state/auth";
import ProductsPage from "./ProductsPage";
import CategoriesPage from "./CategoriesPage";
import AllergensPage from "./AllergensPage";
import SettingsPage from "./SettingsPage";
import OrdersPage from "./OrdersPage";
import PrinterPage from "./PrinterPage";
const SECTIONS = ["Products", "Categories", "Allergens", "Orders", "Printer", "Settings"] as const;

export default function Shell() {
  const { user, slug, loading, signIn, signOut } = useAuth();
  const [form, setForm] = useState({ slug: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Products");

  if (loading) {
    return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Loading…</main>;
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
              await signIn(form.slug.trim(), form.email.trim(), form.password);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full max-w-sm rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-8"
        >
          <h1 className="mb-6 text-2xl font-semibold">Back office</h1>

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="slug">Restaurant</label>
          <input id="slug" required value={form.slug} autoComplete="organization"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="mb-4 h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />

          <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="email">Email</label>
          <input id="email" type="email" required value={form.email} autoComplete="username"
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
          <h1 className="mb-6 text-2xl font-semibold">{section}</h1>
          {section === "Products" && slug ? <ProductsPage slug={slug} />
          : section === "Categories" && slug ? <CategoriesPage slug={slug} />
          : section === "Allergens" && slug ? <AllergensPage slug={slug} />
          : section === "Orders" && slug ? <OrdersPage slug={slug} />
          : section === "Printer" && slug ? <PrinterPage slug={slug} />
          : section === "Settings" && slug ? <SettingsPage slug={slug} />
          : <p className="text-(--color-ink-muted)">Coming in the next step.</p>}
        </main>
    </div>
  );
}