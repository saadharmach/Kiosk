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
  /** null: nothing went wrong. A string (maybe empty): the last card payment was refused or failed, and why. */
  problem: string | null;
  onPick: (method: "CARD" | "CASH") => void;
  onCancelCard: () => void;
  onBack: () => void;
  onSimulate?: (approve: boolean) => void;
}) {
  const t = STRINGS[locale];
  const amount = <span className="tabular-nums">{money(total, currency, locale)}</span>;
  const failed = problem !== null;

  // ---- the card terminal is working: four plain steps, and a bar that says we are waiting
  if (stage === "card") {
    const steps = [t.cardStep1, t.cardStep2, t.cardStep3, t.cardStep4];
    return (
      <div role="dialog" aria-modal="true" aria-label={t.cardWaitTitle} className="screen-in fixed inset-0 z-50 flex flex-col bg-(--color-page) px-14 pt-16 pb-12">
        <h1 className="font-display text-8xl leading-[0.95] font-extrabold">{t.cardPayTitle}</h1>
        <p className="mt-3 font-display text-5xl font-bold">{amount}</p>
        <ol className="mt-10 flex flex-col gap-5">
          {steps.map((text, i) => (
            <li key={i} className="flex items-center gap-6 rounded-[2rem] bg-(--color-surface) px-8 py-6 shadow-md">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-(--color-brand) font-display text-4xl font-extrabold text-(--color-brand-ink)">{i + 1}</span>
              <span className="text-4xl font-semibold">{text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex items-center gap-6 rounded-[2rem] bg-(--color-anthracite) px-8 py-7 text-white">
          <span className="relative flex size-12 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-(--color-brand) opacity-40" />
            <span className="size-6 rounded-full bg-(--color-brand)" />
          </span>
          <span className="font-display text-4xl font-bold tracking-wide uppercase">{t.cardWaiting}</span>
        </div>
        <span className="flex-1" />
        {onSimulate ? (
          <div className="mb-6 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-amber-500 p-4">
            <span className="text-xl font-semibold text-(--color-ink-muted)">{t.simBanner}</span>
            <div className="flex gap-4">
              <button onClick={() => onSimulate(true)} className="min-h-20 rounded-full bg-(--color-success) px-10 text-2xl font-bold text-white">{t.simApprove}</button>
              <button onClick={() => onSimulate(false)} className="min-h-20 rounded-full bg-(--color-danger) px-10 text-2xl font-bold text-white">{t.simDecline}</button>
            </div>
          </div>
        ) : null}
        <button onClick={onCancelCard} disabled={busy}
          className="min-h-28 w-full rounded-full border-2 border-(--color-line) bg-(--color-surface) font-display text-4xl font-extrabold tracking-wide uppercase disabled:opacity-40">
          {t.cancelPayment}
        </button>
      </div>
    );
  }

  // ---- a card payment that did not go through: nothing is validated; retry, cash, or back to the basket
  if (failed) {
    return (
      <div role="dialog" aria-modal="true" aria-label={t.cardNotThrough} className="screen-in fixed inset-0 z-50 flex flex-col bg-(--color-page) px-14 pt-16 pb-12">
        <h1 className="font-display text-8xl leading-[0.95] font-extrabold">{t.cardPayTitle}</h1>
        <p className="mt-3 font-display text-5xl font-bold">{amount}</p>
        <div role="alert" className="mt-10 rounded-[2rem] border-4 border-(--color-danger) bg-(--color-danger-soft) p-8">
          <p className="font-display text-5xl font-extrabold text-(--color-danger)">{t.cardNotThrough}</p>
          {problem ? <p className="mt-2 text-3xl font-semibold text-(--color-danger)">{problem}</p> : null}
          <p className="mt-3 text-3xl font-medium text-(--color-ink)">{t.cardNotValidated}</p>
        </div>
        <span className="flex-1" />
        <div className="flex flex-col gap-5">
          {options.card ? (
            <button onClick={() => onPick("CARD")} disabled={busy}
              className="min-h-32 w-full rounded-full bg-(--color-brand) font-display text-5xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase disabled:opacity-40">{t.retryCard}</button>
          ) : null}
          {options.cash ? (
            <button onClick={() => onPick("CASH")} disabled={busy}
              className="min-h-28 w-full rounded-full border-2 border-(--color-line) bg-(--color-surface) font-display text-4xl font-extrabold tracking-wide uppercase disabled:opacity-40">{t.payCashInstead}</button>
          ) : null}
          <button onClick={onBack} disabled={busy} className="min-h-20 font-display text-3xl font-bold tracking-wide text-(--color-ink-muted) uppercase underline decoration-2 underline-offset-8">{t.backToBasket}</button>
        </div>
      </div>
    );
  }

  // ---- how to pay: two big cards
  const choice = (method: "CARD" | "CASH", icon: "card" | "cash", title: string, sub: string) => (
    <button key={method} onClick={() => onPick(method)} disabled={busy}
      className="flex min-h-72 w-full flex-1 items-center gap-8 rounded-[3rem] bg-(--color-surface) p-8 text-start shadow-lg disabled:opacity-40">
      <span className="flex size-56 shrink-0 items-center justify-center rounded-[2.25rem] bg-(--color-surface-2) text-(--color-brand-deep)">
        <Icon name={icon} className="size-32" strokeWidth={1.2} />
      </span>
      <span className="flex flex-col gap-3">
        <span className="font-display text-7xl leading-none font-extrabold tracking-wide uppercase">{title}</span>
        {sub ? <span className="text-3xl font-medium text-(--color-ink-muted)">{sub}</span> : null}
      </span>
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={t.paymentTitle} className="screen-in fixed inset-0 z-50 flex flex-col bg-(--color-page) px-14 pt-12 pb-12">
      <button onClick={onBack} disabled={busy}
        className="flex h-16 w-fit items-center gap-2 rounded-full border-2 border-(--color-line) bg-(--color-surface) ps-5 pe-7 font-display text-3xl font-extrabold tracking-wide uppercase disabled:opacity-40">
        <Icon name="back" className="size-7 rtl:-scale-x-100" strokeWidth={2.6} />
        <span>{t.backToBasket}</span>
      </button>
      <h1 className="mt-8 font-display text-8xl leading-[0.95] font-extrabold">{t.howToPay}</h1>
      <p className="mt-3 text-3xl font-medium text-(--color-ink-muted)">{t.amountDue} <span className="font-display text-5xl font-extrabold text-(--color-ink)">{amount}</span></p>
      <div className="mt-10 flex flex-1 flex-col gap-8">
        {options.card ? choice("CARD", "card", t.payByCard, t.payByCardSub) : null}
        {options.cash ? choice("CASH", "cash", t.payByCash, options.cashClosed ? "" : t.payByCashSub) : null}
      </div>
    </div>
  );
}
