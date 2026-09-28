"use client";

import { useEffect } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { PlacedOrder } from "@/lib/api";


export default function TicketScreen({
  order, locale, resetDelaySec, onDone,
}: {
  order: PlacedOrder;
  locale: Locale;
  resetDelaySec: number;
  onDone: () => void;
}) {
  const t = STRINGS[locale];

  // The kiosk must free itself for the next customer without being touched.
  useEffect(() => {
    const id = window.setTimeout(onDone, Math.max(5, resetDelaySec) * 1000);
    return () => window.clearTimeout(id);
  }, [resetDelaySec, onDone]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-10 text-center">
      <p className="text-4xl">{t.thanks}</p>
      <p className="text-3xl text-(--color-ink-muted)">{t.orderNumber}</p>
      <p className="text-9xl font-bold tabular-nums tracking-tight">{order.reference}</p>
      <p className="max-w-xl text-3xl">{t.payAtCashier}</p>
      <p className="text-3xl tabular-nums text-(--color-ink-muted)">
        {money(order.total, order.currency, locale)}
      </p>
      <button onClick={onDone}
        className="mt-10 min-h-24 rounded-(--radius-card) border border-(--color-line) px-14 text-2xl">
        {t.newOrder}
      </button>
    </main>
  );
}