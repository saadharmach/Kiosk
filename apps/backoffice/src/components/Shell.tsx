"use client";

import { useCallback, useEffect, useState } from "react";
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
import PaymentPage from "./PaymentPage";
import DashboardPage from "./DashboardPage";
import { AppFrame, ThemeButton, since, type NavGroup } from "./frame";
import { getDashboard } from "@/lib/dashboard";
import { CLOSED_MESSAGE, isClosedMessage } from "@/lib/subscription";

type Section = "dashboard" | "products" | "categories" | "suggestions" | "allergens" | "bornes" | "branding" | "orders" | "payment" | "settings";

const GROUPS: NavGroup<Section>[] = [
  { label: "Pilotage", items: [{ key: "dashboard", label: "Tableau de bord", icon: "dashboard" }] },
  {
    label: "Catalogue",
    items: [
      { key: "products", label: "Articles", icon: "book" },
      { key: "categories", label: "Catégories", icon: "tag" },
      { key: "suggestions", label: "Suggestions", icon: "spark" },
      { key: "allergens", label: "Allergènes", icon: "alert" },
    ],
  },
  { label: "Équipements", items: [{ key: "bornes", label: "Bornes et imprimantes", icon: "borne" }] },
  { label: "Interface", items: [{ key: "branding", label: "Accueil et marque", icon: "image" }] },
  {
    label: "Exploitation",
    items: [
      { key: "orders", label: "Commandes", icon: "cart" },
      { key: "payment", label: "Paiement", icon: "card" },
      { key: "settings", label: "Paramètres", icon: "settings" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
const isSection = (s: string): s is Section => ALL.some((i) => i.key === s);

/** The section in the address (#products), so a reload or a shared link opens the same page. */
function fromHash(): Section {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return isSection(h) ? h : "dashboard";
}

const LABELS = { menu: "Menu", fold: "Réduire le menu", signOut: "Se déconnecter", theme: "Thème clair / sombre", close: "Fermer" };

export default function Shell() {
  const { user, slug, loading, signIn, signOut } = useAuth();
  const [form, setForm] = useState({ slug: "", email: "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  useEffect(() => {
    setSection(fromHash());
    const onHash = () => setSection(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const open = useCallback((s: Section) => {
    setSection(s);
    try { history.replaceState(null, "", `#${s}`); } catch { /* the address just does not follow */ }
  }, []);

  // The top bar's "catalogue synchronised 4 min ago", when there is a till to speak of.
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [tillDown, setTillDown] = useState(false);
  useEffect(() => {
    if (!user || !slug) return;
    const load = () => getDashboard(slug).then((d) => { setSyncedAt(d.till?.lastSyncAt ?? null); setTillDown(d.till ? !d.till.reachable : false); }, () => undefined);
    load();
    const id = window.setInterval(load, 120_000);
    return () => window.clearInterval(id);
  }, [user, slug]);

  if (loading) {
    return <main className="grid min-h-dvh place-items-center text-(--color-ink-muted)">Chargement…</main>;
  }

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
            try {
              // Phone keyboards capitalise the first letter; the restaurant address and the email are never case sensitive.
              await signIn(form.slug.trim().toLowerCase(), form.email.trim().toLowerCase(), form.password);
            } catch (err) {
              // The API gives one answer for every kind of mismatch, on purpose; say what to check.
              const m = (err as Error).message;
              setError(m === "Invalid credentials"
                ? "Adresse du restaurant, e-mail ou mot de passe incorrect. Vérifiez les trois : l’adresse est la forme courte (comme resto-a), pas le nom du restaurant."
                : isClosedMessage(m) ? CLOSED_MESSAGE
                : m.startsWith("Too many") ? "Trop de tentatives. Attendez une minute puis réessayez."
                : m);
            } finally {
              setBusy(false);
            }
          }}
          className="card flex w-full max-w-sm flex-col gap-4 p-8"
        >
          {/* On a white tile, as the brand asks: the logo's dark letters stay readable in the dark theme too. */}
          <span className="self-start rounded-(--radius-card) border border-(--color-line) bg-white px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/nexborn-logo.png" alt="NEXBORN – The Next Generation of Restaurant Technology" className="h-auto w-[200px]" />
          </span>
          <h1 className="text-[19px] font-bold">Connexion au back-office</h1>

          <div>
            <label className="field-label" htmlFor="slug">Adresse du restaurant</label>
            <input id="slug" required value={form.slug} autoComplete="organization" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setForm({ ...form, slug: e.target.value })} className="field" />
            <span className="field-hint">La forme courte de votre restaurant (par exemple resto-a), pas son nom. Demandez-la à l’équipe NEXBORN si besoin.</span>
          </div>

          <div>
            <label className="field-label" htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={form.email} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" />
          </div>

          <div>
            <label className="field-label" htmlFor="password">Mot de passe</label>
            <input id="password" type="password" required value={form.password} autoComplete="current-password"
              onChange={(e) => setForm({ ...form, password: e.target.value })} className="field" />
          </div>

          {error ? <p role="alert" className="note note-err">{error}</p> : null}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Connexion…" : "Se connecter"}
          </button>
          <button type="button" onClick={() => setForgot(true)} className="self-start text-[13px] text-(--color-brand) hover:underline">
            Mot de passe oublié ?
          </button>
        </form>
      </main>
    );
  }

  const current = ALL.find((i) => i.key === section)!;
  return (
    <AppFrame groups={GROUPS} active={section} onPick={open} title={current.label} crumb={current.group}
      user={{ name: user.email.split("@")[0]!, detail: slug ?? undefined }} onSignOut={signOut} labels={LABELS}
      topRight={
        <>
          {slug ? <span className="badge badge-muted max-[860px]:hidden">{slug}</span> : null}
          {tillDown ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-(--color-danger)"><span className="dot dot-off" />Caisse injoignable</span>
          ) : syncedAt ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-(--color-ink-muted) max-[600px]:hidden">
              <span className="dot" />Synchronisé {since(syncedAt, "fr")}
            </span>
          ) : null}
        </>
      }>
      {slug ? (
        <SubscriptionBanner slug={slug} onClosed={(message) => { setError(message); void signOut(); }} />
      ) : null}
      {!slug ? null
        : section === "dashboard" ? <DashboardPage slug={slug} onOpen={open} />
        : section === "products" ? <ProductsPage slug={slug} />
        : section === "categories" ? <CategoriesPage slug={slug} />
        : section === "suggestions" ? <SuggestionsPage slug={slug} />
        : section === "allergens" ? <AllergensPage slug={slug} />
        : section === "orders" ? <OrdersPage slug={slug} />
        : section === "bornes" ? <BornesPage slug={slug} />
        : section === "payment" ? <PaymentPage slug={slug} />
        : section === "branding" ? <BrandingPage slug={slug} />
        : <SettingsPage slug={slug} />}
    </AppFrame>
  );
}
