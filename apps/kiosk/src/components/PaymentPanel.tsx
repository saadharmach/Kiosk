"use client";

import { STRINGS, money, type Locale } from "@/i18n";
import type { PaymentOptions } from "@/lib/api";
import { Icon } from "./icons";

/**
 * The Règlement screen, over the cart: the total, and the ways to pay this borne offers. Then, for a card, the TPE
 * screen ("follow the instructions on the terminal") until the TPE answers.
 */
export default function PaymentPanel({
  stage, options, total, currency, locale, busy, problem, onPick, onCancelCard, onBack, onSimulate,
}: {
  stage: "choose" | "card";
  options: PaymentOptions;
  total: number;
  currency: string;
  locale: Locale;
  busy: boolean;
  /** Why the last card payment did not go through (shown on the choice screen). */
  problem: string | null;
  onPick: (method: "CARD" | "CASH") => void;
  onCancelCard: () => void;
  onBack: () => void;
  onSimulate?: (approve: boolean) => void;
}) {
  const t = STRINGS[locale];
  const amount = <span className="tabular-nums">{money(total, currency, locale)}</span>;

  if (stage === "card") {
    return (
      <div role="dialog" aria-modal="true" aria-label={t.cardWaitTitle} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-(--color-page) px-16 text-center">
        <span className="relative flex size-64 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
          <span className="absolute inset-0 animate-ping rounded-full bg-(--color-brand) opacity-20" />
          <Icon name="card" className="size-32" strokeWidth={1.4} />
        </span>
        <h1 className="font-display text-7xl leading-tight font-bold">{t.cardWaitTitle}</h1>
        <p className="text-4xl text-(--color-ink-muted)">{t.cardWaitText}</p>
        <p className="font-display text-8xl font-bold">{amount}</p>
        <button onClick={onCancelCard} disabled={busy}
          className="mt-4 min-h-28 rounded-full border-2 border-(--color-line) bg-(--color-surface) px-16 font-display text-4xl font-bold disabled:opacity-40">
          {t.cancel}
        </button>
        {onSimulate ? (
          <div className="flex gap-4 rounded-3xl border-2 border-dashed border-amber-500 p-4">
            <button onClick={() => onSimulate(true)} className="min-h-20 rounded-full bg-green-700 px-10 text-2xl font-bold text-white">{t.simApprove}</button>
            <button onClick={() => onSimulate(false)} className="min-h-20 rounded-full bg-red-700 px-10 text-2xl font-bold text-white">{t.simDecline}</button>
          </div>
        ) : null}
      </div>
    );
  }

  const choice = (method: "CARD" | "CASH", icon: "card" | "cash", title: string, sub: string) => (
    <button key={method} onClick={() => onPick(method)} disabled={busy}
      className="flex min-h-56 w-full items-center gap-8 rounded-[2.5rem] border-[3px] border-(--color-line) bg-(--color-surface) px-10 text-start shadow-md active:border-(--color-brand) disabled:opacity-40">
      <span className="flex size-32 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
        <Icon name={icon} className="size-16" strokeWidth={1.6} />
      </span>
      <span className="flex flex-col gap-2">
        <span className="font-display text-5xl font-bold">{title}</span>
        <span className="text-3xl text-(--color-ink-muted)">{sub}</span>
      </span>
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={t.paymentTitle} className="fixed inset-0 z-50 flex flex-col bg-(--color-page)">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-16">
        <h1 className="font-display text-7xl font-bold">{t.paymentTitle}</h1>
        <p className="font-display text-8xl font-bold text-(--color-price)">{amount}</p>
        {problem ? (
          <p role="alert" className="w-full max-w-4xl rounded-3xl bg-(--color-danger-soft) p-6 text-center text-3xl font-semibold text-(--color-danger)">
            {t.cardNotThrough} {problem ? <span className="block text-2xl font-normal">{problem}</span> : null} <span className="block text-2xl font-normal">{t.chooseAgain}</span>
          </p>
        ) : null}
        <div className="flex w-full max-w-4xl flex-col gap-6">
          {options.card ? choice("CARD", "card", t.payByCard, t.payByCardSub) : null}
          {options.cash ? choice("CASH", "cash", t.payByCash, options.cashClosed ? "" : t.payByCashSub) : null}
        </div>
      </div>
      <div className="flex justify-center px-16 pb-14">
        <button onClick={onBack} disabled={busy} className="min-h-28 rounded-full bg-(--color-brand-soft) px-16 font-display text-4xl font-bold text-(--color-brand-deep) disabled:opacity-40">
          {t.back}
        </button>
      </div>
    </div>
  );
}
