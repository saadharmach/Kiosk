"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_NAMES, STRINGS, localized, money, type Locale } from "@/i18n";
import type { Bootstrap, WelcomeSlide } from "@/lib/api";
import { Icon } from "../icons";

/** How long a photo stays before the next slide. A video stays until it has played to its end. */
const PHOTO_MS = 6000;
/** A video that never reports its end (a broken file, a stream) still moves on after this long. */
const VIDEO_MAX_MS = 90_000;
/** How long the help notice stays up. */
const HELP_MS = 7000;

/** One advert: the photo or the video filling the whole frame. Only the slide on show plays. */
function Slide({ slide, active, onEnded, onError }: { slide: WelcomeSlide; active: boolean; onEnded: () => void; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      // A kiosk may refuse to start a video by itself; the slide then simply moves on after its time.
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, [active]);
  const cls = `absolute inset-0 size-full object-cover transition-opacity duration-1000 ${active ? "opacity-100" : "opacity-0"}`;
  return slide.kind === "video" ? (
    <video ref={video} src={slide.url} muted playsInline preload="auto" onEnded={onEnded} onError={onError} className={cls} />
  ) : (
    // Decorative: the texts over it carry the meaning.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={slide.url} alt="" onError={onError} className={cls} />
  );
}

export default function WelcomeScreen({
  boot, locale, onLocale, onStart,
}: {
  boot: Bootstrap;
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
}) {
  const t = STRINGS[locale];
  const r = boot.restaurant;
  const headline = localized(r.tagline, locale);
  const subtitle = localized(r.subtitle, locale);

  // The adverts in turn; one that will not load is dropped, not shown broken.
  const [failed, setFailed] = useState<string[]>([]);
  const slides = r.welcomeSlides.filter((s) => !failed.includes(s.url));
  const [shown, setShown] = useState(0);
  const current = slides.length ? shown % slides.length : -1;
  const slide = current >= 0 ? slides[current]! : null;
  const next = () => setShown((n) => n + 1);
  useEffect(() => {
    if (!slide) return;
    // A single photo stays; a single video plays again from the start.
    if (slides.length === 1 && slide.kind === "image") return;
    const id = setTimeout(next, slide.kind === "video" ? VIDEO_MAX_MS : PHOTO_MS);
    return () => clearTimeout(id);
  }, [slide, slides.length, shown]);

  const [languages, setLanguages] = useState(false);
  // A logo that will not load is left out, not shown as a broken image with its name.
  const [logoFailed, setLogoFailed] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (!help) return;
    const id = setTimeout(() => setHelp(false), HELP_MS);
    return () => clearTimeout(id);
  }, [help]);

  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]!;
  const product = slide?.product ?? null;

  return (
    <main className="flex h-dvh flex-col bg-(--color-chrome) text-(--color-ink)">
      {/* ---- top bar */}
      <div className="flex h-28 shrink-0 items-center justify-between bg-(--color-page) px-14">
        <button onClick={() => onLocale(nextLocale)} aria-label={LOCALE_NAMES[nextLocale]}
          className="flex items-center gap-3 font-display text-3xl font-semibold">
          <Icon name="globe" className="size-9" />
          <span>{locale.toUpperCase()}</span>
        </button>
        {r.logoUrl && !logoFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.logoUrl} alt={r.name} onError={() => setLogoFailed(true)} className="h-18 max-w-60 object-contain" />
        ) : null}
      </div>

      {/* ---- the advert. Tapping it starts too (a kiosk never hides the way in); the button below is the named way. */}
      <div onClick={onStart} className="relative min-h-0 flex-1 cursor-pointer overflow-hidden bg-(--color-page) text-start">
        {slides.map((s, i) => (
          <Slide key={s.url} slide={s} active={i === current}
            onEnded={slides.length > 1 ? next : () => setShown((n) => n + slides.length)}
            onError={() => setFailed((f) => [...f, s.url])} />
        ))}
        {/* Keeps the texts readable on any photo. */}
        {slides.length ? (
          <span className="absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-(--color-page)/90 via-(--color-page)/45 to-transparent" />
        ) : null}

        <span className="absolute inset-x-0 top-0 flex flex-col gap-5 px-14 pt-14">
          <span className="font-display text-3xl font-semibold tracking-[0.12em] uppercase">{r.name}</span>
          {headline ? <span className="max-w-[52rem] font-display text-8xl leading-[1.05] font-bold">{headline}</span> : null}
          {subtitle ? <span className="max-w-[52rem] text-4xl leading-snug text-(--color-ink-muted)">{subtitle}</span> : null}
        </span>

        {product ? (
          <span className="absolute start-14 bottom-14 flex max-w-[40rem] flex-col items-start gap-3 rounded-[2rem] bg-(--color-surface) p-9 shadow-2xl">
            <span className="rounded-xl bg-(--color-brand-soft) px-4 py-2 text-2xl font-semibold">{t.discover}</span>
            <span className="font-display text-4xl leading-tight font-bold">{localized(product.names, locale) ?? product.name}</span>
            <span className="font-display text-6xl font-bold tabular-nums text-(--color-price)">
              {product.fromPrice ? `${t.fromPrice} ` : ""}{money(product.price, boot.restaurant.currency, locale)}
            </span>
          </span>
        ) : null}
      </div>

      {/* ---- which slide */}
      <div className="flex h-16 shrink-0 items-center justify-center gap-3 bg-(--color-page)" aria-hidden="true">
        {slides.length > 1 ? slides.map((s, i) => (
          <span key={s.url} className={`h-3 rounded-full transition-all ${i === current ? "w-14 bg-(--color-price)" : "w-3 bg-(--color-line)"}`} />
        )) : null}
      </div>

      {/* ---- the way in */}
      <div className="flex shrink-0 flex-col gap-6 px-14 pt-10 pb-8">
        <button onClick={onStart}
          className="flex h-28 items-center justify-center gap-5 rounded-[1.75rem] bg-(--color-brand) font-display text-4xl font-bold text-(--color-brand-ink) shadow-lg">
          <span>{t.startOrder}</span>
          <Icon name="hand" className="size-11" strokeWidth={1.9} />
        </button>
        <p className="text-center text-3xl text-(--color-ink-muted)">{t.startHint}</p>

        <div className="relative mt-4 flex items-center justify-between">
          <button onClick={() => setLanguages((v) => !v)} aria-expanded={languages}
            className="flex items-center gap-3 py-3 text-3xl">
            <Icon name="globe" className="size-8" />
            <span>{LOCALE_NAMES[locale]}</span>
          </button>
          {languages ? (
            <span role="menu" className="absolute start-0 bottom-full mb-3 flex flex-col overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-surface) shadow-xl">
              {LOCALES.map((l) => (
                <button key={l} role="menuitemradio" aria-checked={l === locale} onClick={() => { onLocale(l); setLanguages(false); }}
                  className={`px-10 py-6 text-start text-3xl ${l === locale ? "bg-(--color-brand-soft) font-semibold" : ""}`}>
                  {LOCALE_NAMES[l]}
                </button>
              ))}
            </span>
          ) : null}
          <button onClick={() => setHelp(true)} className="py-3 text-3xl text-(--color-ink-muted)">{t.needHelp}</button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nexborn.png" alt="NEXBORN, by POS & SOFT Distribution" className="mx-auto mt-2 h-14 w-auto" />
      </div>

      {help ? (
        <button onClick={() => setHelp(false)} className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-14">
          <span role="status" className="flex items-center gap-5 rounded-[2rem] bg-(--color-surface) px-10 py-8 text-3xl font-medium shadow-2xl">
            <Icon name="info" className="size-10 shrink-0" />
            {t.helpNotice}
          </span>
        </button>
      ) : null}
    </main>
  );
}
