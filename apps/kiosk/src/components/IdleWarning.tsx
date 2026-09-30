"use client";

import { STRINGS, type Locale } from "@/i18n";

const RING = 2 * Math.PI * 106;

/** Shown for the last seconds of an idle session. Only its buttons count as an answer. */
export default function IdleWarning({
  locale, secondsLeft, totalSeconds, onContinue, onDiscard,
}: {
  locale: Locale;
  secondsLeft: number;
  totalSeconds: number;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const t = STRINGS[locale];
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-8">
      <div role="alertdialog" aria-modal="true" aria-label={t.idleTitle}
        className="flex w-full max-w-205 flex-col items-center rounded-[3.25rem] bg-(--color-surface) px-14 pt-16 pb-12 text-center shadow-2xl">
        <div className="relative flex size-60 items-center justify-center">
          <svg viewBox="0 0 240 240" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="120" cy="120" r="106" fill="none" stroke="var(--color-line)" strokeWidth="14" />
            <circle cx="120" cy="120" r="106" fill="none" stroke="var(--color-brand)" strokeWidth="14"
              strokeLinecap="round" strokeDasharray={RING}
              strokeDashoffset={RING * (1 - secondsLeft / totalSeconds)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
          <span className="font-display text-9xl font-bold tabular-nums">{secondsLeft}</span>
        </div>

        <h1 className="mt-11 font-display text-6xl leading-tight font-bold">{t.idleTitle}</h1>
        <p className="mt-5 text-3xl leading-snug text-(--color-ink-muted)">{t.idleText}</p>

        <button onClick={onContinue}
          className="mt-12 min-h-30 w-full rounded-full bg-(--color-brand) font-display text-4xl font-bold text-(--color-brand-ink)">
          {t.keepOrdering}
        </button>
        <button onClick={onDiscard}
          className="mt-5 px-8 py-6 font-display text-3xl font-bold text-(--color-danger)">
          {t.discard}
        </button>
      </div>
    </div>
  );
}
