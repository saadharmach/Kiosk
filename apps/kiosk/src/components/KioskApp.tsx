"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STRINGS, dirOf, isLocale, money, type Locale } from "@/i18n";
import { api, getCatalog, isConnectionError, type Bootstrap, type Catalog, type OrderTypeOption } from "@/lib/api";
import { brandColors } from "@/lib/theme";
import { CartProvider, useCart } from "@/state/cart";
import IdleWarning from "./IdleWarning";
import { LogoTile } from "./icons";
import StatusScreen from "./screens/StatusScreen";
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
  // `connection` marks a request that never got an answer, as opposed to the server refusing it.
  const [error, setError] = useState<{ message: string; connection: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [locale, setLocale] = useState<Locale>("fr");
  const [screen, setScreen] = useState<Screen>("WELCOME");
  const [choice, setChoice] = useState<OrderTypeOption | null>(null);
  const [table, setTable] = useState<number | null>(null);
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);

  // The restaurant's accent colour, with readable text on top of it.
  const primaryColor = boot?.restaurant.primaryColor;
  useEffect(() => {
    const { brand, ink } = brandColors(primaryColor);
    const root = document.documentElement.style;
    root.setProperty("--color-brand", brand);
    root.setProperty("--color-brand-ink", ink);
  }, [primaryColor]);

  useEffect(() => {
    let cancelled = false;
    api.bootstrap(slug).then(
      (d) => {
        if (cancelled) return;
        setBoot(d);
        if (isLocale(d.restaurant.locale)) setLocale(d.restaurant.locale);
      },
      (e) => !cancelled && setError({ message: e.message, connection: isConnectionError(e) }),
    );
    return () => { cancelled = true; };
  }, [slug, attempt]);

  // Load the menu as soon as the order type resolves the sales area, so the
  // customer never waits on a spinner after choosing their table.
  useEffect(() => {
    if (!choice?.salesAreaId) return;
    let cancelled = false;
    getCatalog(slug, choice.salesAreaId, locale).then(
      (c) => !cancelled && setCatalog(c),
      (e) => !cancelled && setError({ message: e.message, connection: isConnectionError(e) }),
    );
    return () => { cancelled = true; };
  }, [slug, choice, locale, attempt]);

  const reset = useCallback(() => {
    setScreen("WELCOME");
    setChoice(null);
    setTable(null);
    cart.clear();
    if (boot && isLocale(boot.restaurant.locale)) setLocale(boot.restaurant.locale);
  }, [boot, cart]);

  // Idle handling: after `idleTimeoutSec` without a touch the kiosk resets itself for
  // the next customer. The last seconds are a visible warning, so nobody loses a
  // half-built order without a chance to keep it.
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const idleTotal = boot ? Math.max(15, boot.ordering.idleTimeoutSec) : 90;
  const warnSec = Math.min(30, Math.floor(idleTotal / 2));
  const keepAlive = useRef<() => void>(() => undefined);

  useEffect(() => {
    // Nothing to protect on the welcome screen, and the ticket resets itself.
    if (!boot || screen === "WELCOME" || screen === "TICKET") return;
    let warnTimer: number | undefined;
    let tick: number | undefined;
    let warning = false;

    const stop = () => { window.clearTimeout(warnTimer); window.clearInterval(tick); };
    const arm = () => {
      stop();
      warning = false;
      setIdleLeft(null);
      warnTimer = window.setTimeout(() => {
        warning = true;
        let left = warnSec;
        setIdleLeft(left);
        tick = window.setInterval(() => {
          left -= 1;
          if (left <= 0) { stop(); setIdleLeft(null); reset(); } else setIdleLeft(left);
        }, 1000);
      }, (idleTotal - warnSec) * 1000);
    };
    // While the warning is up, only its own buttons count as an answer.
    const onActivity = () => { if (!warning) arm(); };

    keepAlive.current = arm;
    arm();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      stop();
      setIdleLeft(null);
    };
  }, [boot, screen, reset, idleTotal, warnSec]);

  const t = STRINGS[locale];

  const retry = () => { setError(null); setAttempt((n) => n + 1); };
  const startOver = () => { setError(null); reset(); setAttempt((n) => n + 1); };
  const header = boot ? { name: boot.restaurant.name, locale, onLocale: setLocale } : undefined;

  if (error?.connection) {
    return (
      <StatusScreen header={header} icon="warning" title={t.connectionTitle} text={t.connectionText}
        action={{ label: t.retry, icon: "refresh", onClick: retry }}
        secondary={{ label: t.startOver, onClick: startOver }} />
    );
  }
  // Nothing the customer could order: better a clear message than an empty choice screen.
  const nothingOrderable = Boolean(boot) && !boot!.orderTypes.some((o) => o.configured);
  if (error || (boot && !boot.catalogReady) || nothingOrderable) {
    return (
      <StatusScreen header={header} icon="warning" title={t.errorTitle} text={error?.message ?? t.menuUnavailable}
        action={{ label: t.retry, icon: "refresh", onClick: retry }} />
    );
  }

  if (!boot) {
    return <LoadingScreen label={t.loading} />;
  }

  const renderScreen = () => {

  const usable = boot.orderTypes.filter((o) => o.configured);
  const pick = (o: OrderTypeOption) => { setChoice(o); setScreen(o.askTable ? "TABLE" : "MENU"); };
  const begin = () => (usable.length === 1 ? pick(usable[0]) : setScreen("ORDER_TYPE"));

  if (screen === "WELCOME") {
    return <WelcomeScreen boot={boot} locale={locale} onLocale={setLocale} onStart={begin} />;
  }
  if (screen === "ORDER_TYPE") {
    return <OrderTypeScreen options={usable} locale={locale} name={boot.restaurant.name} onLocale={setLocale}
        onPick={pick} onBack={reset} />;
  }
  if (screen === "TABLE" && choice) {
    return (
      <TableScreen locale={locale} name={boot.restaurant.name} onLocale={setLocale} ranges={choice.tableRanges}
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
      <MenuScreen catalog={catalog} locale={locale} name={boot.restaurant.name} onLocale={setLocale} tableNumber={table}
        showImages={boot.ordering.showProductImages}
        onViewOrder={() => setScreen("CART")}
        onBack={() => setScreen(choice?.askTable ? "TABLE" : "WELCOME")} />
    );
  }

    if (screen === "CART" && choice?.salesAreaId && catalog) {
    return (
      <CartScreen
        slug={slug}
        locale={locale}
        name={boot.restaurant.name}
        onLocale={setLocale}
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
        name={boot.restaurant.name}
        onLocale={setLocale}
        resetDelaySec={boot.ordering.resetDelaySec}
        standNumber={choice?.askTable ? null : (order.tableNumber ?? null)}
        onDone={reset}
      />
    );
  }

  return (
    <LoadingScreen label={t.loading} />
  );
  };

  return (
    <>
      {renderScreen()}
      {idleLeft !== null ? (
        <IdleWarning locale={locale} secondsLeft={idleLeft} totalSeconds={warnSec}
          onContinue={() => keepAlive.current()} onDiscard={reset} />
      ) : null}
    </>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main role="status" className="flex min-h-dvh flex-col items-center justify-center gap-14 bg-(--color-navy) text-white">
      <span className="relative flex size-64 items-center justify-center">
        <svg viewBox="0 0 260 260" className="absolute inset-0 animate-spin [animation-duration:2.4s]" aria-hidden="true">
          <circle cx="130" cy="130" r="120" fill="none" stroke="var(--color-brand)" strokeWidth="8"
            strokeDasharray="34 22" strokeLinecap="round" />
        </svg>
        <LogoTile className="size-36 rounded-[2.4rem]" iconClass="size-20" />
      </span>
      <p className="font-display text-5xl font-bold">{label}</p>
    </main>
  );
}
