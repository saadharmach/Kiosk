"use client";

import type { ReactNode } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import { Icon, LogoTile } from "./icons";

/** The navy bar every customer screen shares: back, restaurant mark, language. */
export default function KioskHeader({
  name, locale, onLocale, onBack, backLabel, extra,
}: {
  name: string;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onBack?: () => void;
  backLabel?: string;
  extra?: ReactNode;
}) {
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
  return (
    <header className="flex h-32 shrink-0 items-center gap-6 border-b border-(--color-line) bg-(--color-chrome) px-12 text-(--color-ink)">
      {onBack ? (
        <button onClick={onBack}
          className="flex h-18 items-center gap-3 rounded-full bg-(--color-surface-2) px-7 font-display text-3xl font-semibold">
          <Icon name="back" className="size-7 rtl:-scale-x-100" strokeWidth={2.2} />
          <span>{backLabel}</span>
        </button>
      ) : null}
      <LogoTile />
      <span className="font-display text-4xl font-bold">{name}</span>
      <span className="flex-1" />
      {extra}
      <button onClick={() => onLocale(next)} aria-label={LOCALE_NAMES[next]}
        className="flex h-15 items-center gap-2.5 rounded-xl border-2 border-(--color-line) px-5 font-display text-3xl font-semibold">
        <Icon name="globe" className="size-6" />
        <span>{locale.toUpperCase()}</span>
      </button>
    </header>
  );
}
