"use client";

import { LOCALES, LOCALE_NAMES, STRINGS, type Locale } from "@/i18n";
import type { Bootstrap } from "@/lib/api";
import { Icon, LogoTile } from "../icons";

export default function WelcomeScreen({
  boot, locale, onLocale, onStart,
}: {
  boot: Bootstrap;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
}) {
  const t = STRINGS[locale];
  // The prompt in the two other languages, so a foreign visitor still sees it.
  const otherPrompts = LOCALES.filter((l) => l !== locale).map((l) => STRINGS[l].tapToStart).join(" • ");

  return (
    <main className="flex min-h-dvh flex-col bg-(--color-navy) text-white">
      <div role="group" aria-label="Language" className="flex justify-center gap-3 px-8 pt-14">
        {LOCALES.map((l) => (
          <button key={l} onClick={() => onLocale(l)} aria-pressed={l === locale}
            className={`h-16 rounded-full border-2 px-7 font-display text-2xl font-semibold ${
              l === locale
                ? "border-(--color-brand) bg-(--color-brand) text-(--color-brand-ink)"
                : "border-slate-600 bg-(--color-navy-2)"
            }`}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>

      {/* The whole area is the start button: a kiosk should never hide the way in. */}
      <button onClick={onStart} className="flex flex-1 flex-col items-center justify-center gap-10 p-10 text-center">
        <LogoTile className="size-52 rounded-[3.25rem]" iconClass="size-28" />
        <h1 className="font-display text-8xl leading-none font-bold">{boot.restaurant.name}</h1>

        <span className="mt-12 flex flex-col items-center gap-6">
          <span className="flex size-40 items-center justify-center rounded-full bg-(--color-navy-2)">
            <span className="flex size-28 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
              <Icon name="hand" className="size-14" strokeWidth={1.8} />
            </span>
          </span>
          <span className="font-display text-7xl font-bold">{t.tapToStart}</span>
          <span className="text-3xl text-(--color-brand)">{otherPrompts}</span>
        </span>
      </button>
    </main>
  );
}
