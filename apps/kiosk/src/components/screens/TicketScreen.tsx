"use client";

import { useEffect } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
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

  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} />

      <div className="flex flex-1 flex-col items-center px-16 pt-24 text-center">
        <span className="flex size-40 items-center justify-center rounded-full bg-(--color-success) text-white shadow-xl">
          <Icon name="check" className="size-20" strokeWidth={2.4} />
        </span>
        <h1 className="mt-10 font-display text-7xl leading-tight font-bold">{t.thanks}</h1>

        {/* The number the customer needs takes the middle of the screen. */}
        <div className="mt-14 w-full max-w-3xl rounded-[2.75rem] border-[3px] border-(--color-brand) bg-(--color-brand-soft) px-10 py-10">
          <p className="text-3xl font-bold tracking-wider text-(--color-brand-deep) uppercase">
            {standNumber !== null ? t.standNumber : t.orderNumber}
          </p>
          <p dir="ltr" className={`mt-3 font-display leading-none font-bold tabular-nums ${standNumber !== null ? "text-[16rem]" : "text-8xl"}`}>
            {standNumber !== null ? standNumber : order.reference}
          </p>
          {standNumber !== null ? (
            <p dir="ltr" className="mt-4 text-3xl text-(--color-ink-muted) tabular-nums">{order.reference}</p>
          ) : null}
        </div>

        <div className="mt-9 flex w-full max-w-3xl items-center gap-6 rounded-4xl border-2 border-(--color-line) bg-(--color-surface) p-8 text-start">
          <span className="flex size-22 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
            <Icon name="card" className="size-11" strokeWidth={1.8} />
          </span>
          <div className="flex-1">
            <p className="font-display text-3xl leading-tight font-bold">{t.payAtCashier}</p>
          </div>
          <p className="font-display text-4xl font-bold tabular-nums">
            {money(order.total, order.currency, locale)}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 px-16 pt-8 pb-16">
        <button onClick={onDone}
          className="min-h-30 w-full rounded-full bg-(--color-brand) font-display text-5xl font-bold text-(--color-brand-ink)">
          {t.newOrder}
        </button>
        <p className="flex items-center gap-3 text-2xl text-(--color-ink-muted)">
          <span className="size-3.5 rounded-full bg-(--color-brand)" />
          {t.resetNote.replace("{s}", String(resetSec))}
        </p>
      </div>
    </main>
  );
}
