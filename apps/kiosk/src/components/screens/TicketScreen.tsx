"use client";

import { useEffect } from "react";
import { ORDER_TYPE_LABEL, STRINGS, money, type Locale } from "@/i18n";
import type { PlacedOrder } from "@/lib/api";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";

export default function TicketScreen({
  order, locale, name, resetDelaySec, standNumber, onLocale, onDone,
}: {
  order: PlacedOrder;
  locale: Locale;
  name: string;
  resetDelaySec: number;
  standNumber: number | null;
  onLocale: (l: Locale) => void;
  onDone: () => void;
}) {
  const t = STRINGS[locale];
  const resetSec = Math.max(5, resetDelaySec);

  // The kiosk must free itself for the next customer without being touched.
  useEffect(() => {
    const id = window.setTimeout(onDone, resetSec * 1000);
    return () => window.clearTimeout(id);
  }, [resetSec, onDone]);

  const paid = Boolean(order.payment?.paid);
  const typeLabel = order.orderType ? ORDER_TYPE_LABEL(order.orderType, t) : null;
  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} />

      <div className="flex flex-1 flex-col items-center px-14 pt-14 text-center">
        {/* The tick draws itself in 600 ms. Green: a confirmation. */}
        <span className="flex size-52 items-center justify-center rounded-full bg-(--color-success) text-white shadow-xl">
          <svg viewBox="0 0 24 24" className="size-28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" className="draw-tick" />
          </svg>
        </span>
        <h1 className="mt-10 font-display text-9xl leading-[0.9] font-extrabold tracking-wide uppercase">{t.thanksFull}</h1>

        {/* The number the customer needs takes the middle of the screen. */}
        <div className="mt-12 w-full max-w-4xl rounded-[3rem] bg-(--color-surface) px-10 py-10 shadow-lg">
          <p className="text-3xl font-bold tracking-wider text-(--color-brand-deep) uppercase">
            {standNumber !== null ? t.standNumber : t.orderNumber}
          </p>
          <p dir="ltr" className={`mt-2 font-display leading-none font-extrabold tabular-nums ${standNumber !== null ? "text-[17rem]" : "text-[10rem]"}`}>
            {standNumber !== null ? standNumber : order.reference}
          </p>
          {standNumber !== null ? (
            <p dir="ltr" className="mt-3 text-3xl font-semibold text-(--color-ink-muted) tabular-nums">{order.reference}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {typeLabel ? (
              <span className="rounded-full bg-(--color-surface-2) px-6 py-3 font-display text-3xl font-bold tracking-wide text-(--color-brand-deep) uppercase">
                {typeLabel}{standNumber !== null ? ` · ${standNumber}` : order.tableNumber ? ` · ${t.table} ${order.tableNumber}` : ""}
              </span>
            ) : null}
            <span className={`rounded-full px-6 py-3 font-display text-3xl font-bold tracking-wide uppercase ${
              paid ? "bg-(--color-success) text-white" : "bg-(--color-anthracite) text-white"
            }`}>
              {paid ? t.cardAccepted : t.cashToPay}
            </span>
          </div>
        </div>

        <p className="mt-9 max-w-3xl text-4xl leading-snug font-semibold">
          {paid ? t.servedMessage : `${t.payAtCashier} · ${money(order.total, order.currency, locale)}`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5 px-14 pt-8 pb-14">
        {/* The countdown: the screen frees itself for the next customer. */}
        <div className="h-3 w-full max-w-4xl overflow-hidden rounded-full bg-(--color-line)" aria-hidden="true">
          <div className="h-full origin-left rounded-full bg-(--color-brand) rtl:origin-right"
            style={{ animation: `countdown ${resetSec}s linear forwards` }} />
        </div>
        <button onClick={onDone}
          className="min-h-30 w-full max-w-4xl rounded-full bg-(--color-brand) font-display text-6xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
          {t.finish}
        </button>
        <p className="flex items-center gap-3 text-2xl font-medium text-(--color-ink-muted)">
          {t.resetNote.replace("{s}", String(resetSec))}
        </p>
      </div>
    </main>
  );
}
