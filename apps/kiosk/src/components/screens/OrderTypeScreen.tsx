"use client";

import { ORDER_TYPE_LABEL, STRINGS, type Locale } from "@/i18n";
import type { OrderTypeOption } from "@/lib/api";

export default function OrderTypeScreen({
  options, locale, onPick, onBack,
}: {
  options: OrderTypeOption[];
  locale: Locale;
  onPick: (o: OrderTypeOption) => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  return (
    <main className="flex min-h-dvh flex-col gap-10 p-10">
      <h1 className="mt-10 text-center text-5xl font-semibold">{t.orderTypeTitle}</h1>
      <div className="flex flex-1 flex-col justify-center gap-6">
        {options.map((o) => (
          <button key={o.orderType} onClick={() => onPick(o)}
            className="min-h-40 rounded-(--radius-card) bg-(--color-brand) text-4xl font-medium text-(--color-brand-ink)">
            {ORDER_TYPE_LABEL(o.orderType, t)}
          </button>
        ))}
      </div>
      <button onClick={onBack} className="min-h-20 rounded-(--radius-card) border border-(--color-line) text-2xl">
        {t.back}
      </button>
    </main>
  );
}
