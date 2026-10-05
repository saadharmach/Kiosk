"use client";

import { useEffect, useState } from "react";
import { LOCALES, LOCALE_NAMES, STRINGS, localized, type Locale } from "@/i18n";
import type { Bootstrap } from "@/lib/api";
import { Icon, LogoTile } from "../icons";

/** How long each welcome photo stays before the next one fades in. */
const SLIDE_MS = 6000;

export default function WelcomeScreen({
  boot, locale, onLocale, onStart,
}: {
  boot: Bootstrap;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
}) {
  const t = STRINGS[locale];
  const tagline = localized(boot.restaurant.tagline, locale);
  // The restaurant's photos (offers, adverts) in turn. One that will not load is dropped, not shown broken.
  const [failed, setFailed] = useState<string[]>([]);
  const photos = boot.restaurant.welcomeImageUrls.filter((u) => !failed.includes(u));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const id = setInterval(() => setShown((n) => n + 1), SLIDE_MS);
    return () => clearInterval(id);
  }, [photos.length]);
  const current = photos.length ? shown % photos.length : -1;
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
        {tagline ? <p className="-mt-4 max-w-4xl text-4xl leading-snug text-slate-400">{tagline}</p> : null}

        {photos.length ? (
          <span className="relative block aspect-[2/1] w-full max-w-[62.5rem] overflow-hidden rounded-[2.75rem] shadow-2xl">
            {photos.map((src, i) => (
              // Decorative: the name and prompt carry the meaning. All are kept loaded, so the change is a fade, not a blank.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" onError={() => setFailed((f) => [...f, src])}
                className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`} />
            ))}
            {photos.length > 1 ? (
              <span className="absolute inset-x-0 bottom-5 flex justify-center gap-3" aria-hidden="true">
                {photos.map((src, i) => (
                  <span key={src} className={`size-4 rounded-full ${i === current ? "bg-white" : "bg-white/40"}`} />
                ))}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className={`flex flex-col items-center gap-6 ${photos.length ? "mt-6" : "mt-12"}`}>
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
