"use client";

import { LOCALES, LOCALE_NAMES, STRINGS, type Locale } from "@/i18n";
import type { Bootstrap } from "@/lib/api";

export default function WelcomeScreen({
  boot, locale, onLocale, onStart,
}: {
  boot: Bootstrap;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
}) {
  const t = STRINGS[locale];
  return (
    <main className="flex min-h-dvh flex-col">
      {/* The whole screen is the start button: a kiosk should never hide the way in. */}
      <button onClick={onStart} className="flex flex-1 flex-col items-center justify-center gap-8 p-10 text-center">
        <p className="text-3xl text-(--color-ink-muted)">{boot.restaurant.name}</p>
        <h1 className="text-8xl font-semibold">{t.welcome}</h1>
        <p className="mt-6 animate-pulse text-3xl">{t.tapToStart}</p>
      </button>

      <div className="flex justify-center gap-4 p-8">
        {LOCALES.map((l) => (
          <button key={l} onClick={(e) => { e.stopPropagation(); onLocale(l); }}
            aria-pressed={l === locale}
            className={`min-h-20 min-w-44 rounded-(--radius-card) border px-6 text-2xl ${
              l === locale
                ? "border-transparent bg-(--color-brand) text-(--color-brand-ink)"
                : "border-(--color-line) bg-(--color-surface-2)"
            }`}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    </main>
  );
}
