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

        {/* Side by side, the icon centred above the name: compact, and still a big target each. */}
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full gap-8" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, maxWidth: options.length === 1 ? "32rem" : undefined }}>
            {options.map((o) => (
              <button key={o.orderType} onClick={() => onPick(o)}
                className="flex flex-col items-center gap-6 rounded-[3rem] bg-(--color-surface) px-8 pt-12 pb-10 text-center shadow-lg">
                <span className="flex size-48 items-center justify-center rounded-[2.25rem] bg-(--color-surface-2) text-(--color-brand-deep)">
                  <Icon name={ICON[o.orderType] ?? "bag"} className="size-28" strokeWidth={1.3} />
                </span>
                <span className="flex flex-col items-center gap-2">
                  <span className="font-display text-6xl leading-none font-extrabold tracking-wide text-balance uppercase">{ORDER_TYPE_LABEL(o.orderType, t)}</span>
                  <span className="text-2xl font-medium text-balance text-(--color-ink-muted)">{sub(o.orderType)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="flex items-center gap-5 rounded-3xl bg-(--color-surface-2) px-8 py-6 text-2xl font-semibold text-(--color-brand-deep)">
          <Icon name="info" className="size-9 shrink-0" />
          {t.helpNotice}
        </p>
      </div>
    </main>
  );
}
