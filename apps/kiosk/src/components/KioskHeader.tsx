"use client";

import type { ReactNode } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import { Icon, LogoTile } from "./icons";

/** The bar every customer screen shares: back, restaurant mark, language. */
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
    <header className="flex h-28 shrink-0 items-center gap-5 bg-(--color-chrome) px-12 text-(--color-ink)">
      {onBack ? (
        <button onClick={onBack}
          className="flex h-16 items-center gap-2 rounded-full border-2 border-(--color-line) bg-(--color-surface) ps-5 pe-7 font-display text-3xl font-extrabold tracking-wide uppercase">
          <Icon name="back" className="size-7 rtl:-scale-x-100" strokeWidth={2.6} />
          <span>{backLabel}</span>
        </button>
      ) : null}
      <LogoTile />
      <span className="truncate font-display text-4xl font-extrabold tracking-wide uppercase">{name}</span>
      <span className="flex-1" />
      {extra}
      <button onClick={() => onLocale(next)} aria-label={LOCALE_NAMES[next]}
        className="flex h-16 items-center gap-2.5 rounded-full border-2 border-(--color-line) bg-(--color-surface) px-6 font-display text-3xl font-extrabold">
        <Icon name="globe" className="size-6" />
        <span>{locale.toUpperCase()}</span>
      </button>
    </header>
  );
}
