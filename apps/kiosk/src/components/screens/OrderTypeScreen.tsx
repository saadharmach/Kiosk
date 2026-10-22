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

      <div className="flex flex-1 flex-col gap-8 px-14 pt-10 pb-14">
        <div>
          <h1 className="font-display text-8xl leading-[0.95] font-extrabold">{t.orderTypeTitle}</h1>
          <p className="mt-4 text-3xl font-medium text-(--color-ink-muted)">{t.chooseToContinue}</p>
        </div>

        {/* Big cards, one under the other: two taps' worth of space each, readable at arm's length. */}
        <div className="flex flex-1 flex-col gap-8">
          {options.map((o) => (
            <button key={o.orderType} onClick={() => onPick(o)}
              className="flex min-h-96 flex-1 items-center gap-10 rounded-[3rem] bg-(--color-surface) p-10 text-start shadow-lg">
              <span className="flex size-72 shrink-0 items-center justify-center rounded-[2.5rem] bg-(--color-surface-2) text-(--color-brand-deep)">
                <Icon name={ICON[o.orderType] ?? "bag"} className="size-44" strokeWidth={1.2} />
              </span>
              <span className="flex flex-col gap-3">
                <span className="font-display text-8xl leading-none font-extrabold tracking-wide uppercase">{ORDER_TYPE_LABEL(o.orderType, t)}</span>
                <span className="text-4xl font-medium text-(--color-ink-muted)">{sub(o.orderType)}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="flex items-center gap-5 rounded-3xl bg-(--color-surface-2) px-8 py-6 text-2xl font-semibold text-(--color-brand-deep)">
          <Icon name="info" className="size-9 shrink-0" />
          {t.helpNotice}
        </p>
      </div>
    </main>
  );
}
