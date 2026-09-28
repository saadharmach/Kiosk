"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STRINGS, dirOf, isLocale, money, type Locale } from "@/i18n";
import { api, getCatalog, type Bootstrap, type Catalog, type OrderTypeOption } from "@/lib/api";
import { CartProvider, useCart } from "@/state/cart";
import WelcomeScreen from "./screens/WelcomeScreen";
import OrderTypeScreen from "./screens/OrderTypeScreen";
import TableScreen from "./screens/TableScreen";
import MenuScreen from "./screens/MenuScreen";
import CartScreen from "./screens/CartScreen";
import TicketScreen from "./screens/TicketScreen";
import type { PlacedOrder } from "@/lib/api";

type Screen = "WELCOME" | "ORDER_TYPE" | "TABLE" | "MENU" | "CART" | "TICKET";
 

export default function KioskApp({ slug }: { slug: string }) {
  return (
    <CartProvider>
      <KioskFlow slug={slug} />
    </CartProvider>
  );
}

function KioskFlow({ slug }: { slug: string }) {
  const cart = useCart();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>("fr");
  const [screen, setScreen] = useState<Screen>("WELCOME");
  const [choice, setChoice] = useState<OrderTypeOption | null>(null);
  const [table, setTable] = useState<number | null>(null);
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    api.bootstrap(slug).then(
      (d) => {
        if (cancelled) return;
        setBoot(d);
        if (isLocale(d.restaurant.locale)) setLocale(d.restaurant.locale);
      },
      (e) => !cancelled && setError(e.message),
    );
    return () => { cancelled = true; };
  }, [slug]);

  // Load the menu as soon as the order type resolves the sales area, so the
  // customer never waits on a spinner after choosing their table.
  useEffect(() => {
    if (!choice?.salesAreaId) return;
    let cancelled = false;
    getCatalog(slug, choice.salesAreaId, locale).then(
      (c) => !cancelled && setCatalog(c),
      (e) => !cancelled && setError(e.message),
    );
    return () => { cancelled = true; };
  }, [slug, choice, locale]);

  const reset = useCallback(() => {
    setScreen("WELCOME");
    setChoice(null);
    setTable(null);
    cart.clear();
    if (boot && isLocale(boot.restaurant.locale)) setLocale(boot.restaurant.locale);
  }, [boot, cart]);

  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!boot) return;
    const ms = Math.max(15, boot.ordering.idleTimeoutSec) * 1000;
    const bump = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { if (screen !== "WELCOME") reset(); }, ms);
    };
    bump();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [boot, screen, reset]);

  const t = STRINGS[locale];

  if (error || (boot && !boot.catalogReady)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-5xl font-semibold text-(--color-danger)">{t.errorTitle}</h1>
        <p className="text-2xl text-(--color-ink-muted)">{error ?? t.menuUnavailable}</p>
        <button onClick={() => location.reload()}
          className="min-h-20 rounded-(--radius-card) bg-(--color-brand) px-12 text-3xl font-medium text-(--color-brand-ink)">
          {t.retry}
        </button>
      </main>
    );
  }

  if (!boot) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-3xl text-(--color-ink-muted)">{t.loading}</p>
      </main>
    );
  }

  const usable = boot.orderTypes.filter((o) => o.configured);
  const pick = (o: OrderTypeOption) => { setChoice(o); setScreen(o.askTable ? "TABLE" : "MENU"); };
  const begin = () => (usable.length === 1 ? pick(usable[0]) : setScreen("ORDER_TYPE"));

  if (screen === "WELCOME") {
    return <WelcomeScreen boot={boot} locale={locale} onLocale={setLocale} onStart={begin} />;
  }
  if (screen === "ORDER_TYPE") {
    return <OrderTypeScreen options={usable} locale={locale} onPick={pick} onBack={reset} />;
  }
  if (screen === "TABLE" && choice) {
    return (
      <TableScreen locale={locale} ranges={choice.tableRanges}
        onBack={() => setScreen(usable.length === 1 ? "WELCOME" : "ORDER_TYPE")}
        onConfirm={(n) => { setTable(n); setScreen("MENU"); }} />
    );
  }
  if (screen === "MENU") {
    if (!catalog) {
      return (
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-3xl text-(--color-ink-muted)">{t.loading}</p>
        </main>
      );
    }
    return (
      <MenuScreen catalog={catalog} locale={locale} tableNumber={table}
        onViewOrder={() => setScreen("CART")}
        onBack={() => setScreen(choice?.askTable ? "TABLE" : "WELCOME")} />
    );
  }

    if (screen === "CART" && choice?.salesAreaId && catalog) {
    return (
      <CartScreen
        slug={slug}
        locale={locale}
        currency={catalog.currency}
        orderType={choice.orderType}
        salesAreaId={choice.salesAreaId}
        tableNumber={table}
        onBack={() => setScreen("MENU")}
        onPlaced={(o) => { setOrder(o); setScreen("TICKET"); }}
      />
    );
  }

  if (screen === "TICKET" && order) {
    return (
      <TicketScreen
        order={order}
        locale={locale}
        resetDelaySec={boot.ordering.resetDelaySec}
        onDone={reset}
      />
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-3xl text-(--color-ink-muted)">{t.loading}</p>
    </main>
  );
}
