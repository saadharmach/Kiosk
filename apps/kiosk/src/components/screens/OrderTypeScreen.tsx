"use client";

import { ORDER_TYPE_LABEL, STRINGS, type Locale } from "@/i18n";
import type { OrderTypeOption } from "@/lib/api";
import KioskHeader from "../KioskHeader";
import { Icon, type IconName } from "../icons";

const ICON: Record<string, IconName> = { EAT_IN: "eatIn", TAKE_AWAY: "bag", DELIVERY: "truck" };

export default function OrderTypeScreen({
  options, locale, name, onLocale, onPick, onBack,
}: {
  options: OrderTypeOption[];
  locale: Locale;
  name: string;
  onLocale: (l: Locale) => void;
  onPick: (o: OrderTypeOption) => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  const sub = (type: string) =>
    type === "EAT_IN" ? t.eatInSub : type === "TAKE_AWAY" ? t.takeAwaySub : t.deliverySub;

  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} onBack={onBack} backLabel={t.back} />

      <div className="flex flex-1 flex-col gap-10 px-16 pt-16 pb-14">
        <h1 className="font-display text-6xl leading-tight font-bold">{t.orderTypeTitle}</h1>

        <div className="flex flex-1 items-center">
          <div className="grid w-full gap-9" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
            {options.map((o) => (
              <button key={o.orderType} onClick={() => onPick(o)}
                className="flex h-[36dvh] min-h-96 flex-col items-center justify-start gap-7 pt-16 rounded-[3rem] border-[3px] border-(--color-line) bg-(--color-surface) p-9 text-center shadow-md">
                <span className="flex size-56 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
                  <Icon name={ICON[o.orderType] ?? "bag"} className="size-28" strokeWidth={1.5} />
                </span>
                <span className="font-display text-6xl leading-tight font-bold">{ORDER_TYPE_LABEL(o.orderType, t)}</span>
                <span className="text-3xl text-(--color-ink-muted)">{sub(o.orderType)}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="flex items-center gap-5 rounded-3xl bg-(--color-brand-soft) px-8 py-6 text-2xl font-medium text-(--color-brand-deep)">
          <Icon name="info" className="size-9 shrink-0" />
          {t.helpNotice}
        </p>
      </div>
    </main>
  );
}
