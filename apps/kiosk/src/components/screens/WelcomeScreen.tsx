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
  const productName = product ? localized(product.names, locale) ?? product.name : null;
  // The big line: the restaurant's own headline, else the advertised product's name, else the restaurant's name.
  const title = headline ?? productName ?? r.name;
  const price = product ? money(product.price, r.currency, locale) : null;
  // "52,00 MAD" → the number big, the currency small, in the bubble.
  const [bubbleNumber, bubbleCurrency] = price ? [price.replace(/\s*[A-Za-z]{3}\s*$/, "").replace(/[,.]00$/, ""), r.currency] : [null, null];

  return (
    <main className="flex h-dvh flex-col bg-(--color-anthracite) text-white">
      {/* ---- the campaign: photo or video over the whole upper part. Tapping it starts too (a kiosk never hides the
              way in); the button below is the named way. */}
      <div onClick={onStart} className="relative min-h-0 flex-1 cursor-pointer overflow-hidden text-start">
        {slides.length === 0 ? (
          // No advert set: a warm, quiet cover with the restaurant's name.
          <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_70%_62%,color-mix(in_srgb,var(--color-brand)_55%,transparent),transparent_55%)]" />
        ) : null}
        {slides.map((s, i) => (
          <Slide key={s.url} slide={s} active={i === current}
            onEnded={slides.length > 1 ? next : () => setShown((n) => n + slides.length)}
            onError={() => setFailed((f) => [...f, s.url])} />
        ))}
        {/* Dark at the top and the bottom: the white texts read on any photo. */}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/10 to-black/55" />

        {/* top bar: the restaurant, the invitation, the language */}
        <span className="absolute inset-x-0 top-0 flex items-center gap-6 px-14 pt-12">
          {r.logoUrl && !logoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logoUrl} alt="" onError={() => setLogoFailed(true)} className="size-20 rounded-full bg-white object-contain p-1" />
          ) : null}
          <span className="font-display text-5xl font-extrabold tracking-wide uppercase">{r.name}</span>
          <span className="flex-1" />
          <span className="max-w-72 text-end text-2xl font-semibold text-white/85">{t.startHint}</span>
        </span>

        {/* the message */}
        <span className="absolute inset-x-0 top-40 flex flex-col items-start gap-6 px-14">
          {product ? (
            <span className="rounded-full bg-(--color-brand) px-6 py-2 font-display text-3xl font-extrabold tracking-widest text-(--color-brand-ink) uppercase">{t.discover}</span>
          ) : null}
          <span className="max-w-[44rem] font-display text-[10rem] leading-[0.88] font-extrabold tracking-tight text-[#ffd27a] uppercase">{title}</span>
          {subtitle ? <span className="max-w-[40rem] text-4xl leading-snug font-medium text-white">{subtitle}</span> : null}
        </span>

        {price ? (
          <span className="float-slow absolute end-14 bottom-24 flex size-60 flex-col items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink) shadow-2xl">
            <span className="text-2xl font-semibold">{product?.fromPrice ? t.fromPrice : t.onlyPrice}</span>
            <span className="font-display text-8xl leading-none font-extrabold tabular-nums">{bubbleNumber}</span>
            <span className="font-display text-3xl font-bold">{bubbleCurrency}</span>
          </span>
        ) : null}

        {/* which slide */}
        <span className="absolute inset-x-0 bottom-9 flex items-center justify-center gap-3" aria-hidden="true">
          {slides.length > 1 ? slides.map((s, i) => (
            <span key={s.url} className={`h-3 rounded-full transition-all ${i === current ? "w-14 bg-white" : "w-3 bg-white/50"}`} />
          )) : null}
        </span>
      </div>

      {/* ---- the way in */}
      <div className="flex shrink-0 flex-col items-center gap-6 bg-(--color-surface) px-14 pt-10 pb-8 text-(--color-ink)">
        <button onClick={onStart}
          className="breathe flex h-32 w-full items-center justify-center gap-6 rounded-full bg-(--color-brand) font-display text-6xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase shadow-xl">
          <span>{t.startOrder}</span>
          <Icon name="chevron" className="size-12 rtl:-scale-x-100" strokeWidth={3} />
        </button>

        <div className="relative flex w-full items-center justify-between">
          <button onClick={() => setLanguages((v) => !v)} aria-expanded={languages}
            className="flex items-center gap-3 py-3 text-3xl font-semibold">
            <Icon name="globe" className="size-8" />
            <span>{LOCALE_NAMES[locale]}</span>
          </button>
          {languages ? (
            <span role="menu" className="absolute start-0 bottom-full mb-3 flex flex-col overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-surface) shadow-xl">
              {LOCALES.map((l) => (
                <button key={l} role="menuitemradio" aria-checked={l === locale} onClick={() => { onLocale(l); setLanguages(false); }}
                  className={`px-10 py-6 text-start text-3xl ${l === locale ? "bg-(--color-brand-soft) font-bold" : ""}`}>
                  {LOCALE_NAMES[l]}
                </button>
              ))}
            </span>
          ) : null}
          <button onClick={() => setHelp(true)} className="py-3 text-3xl font-semibold text-(--color-ink-muted)">{t.needHelp}</button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nexborn.png" alt="NEXBORN, by POS & SOFT Distribution" className="h-12 w-auto" />
      </div>

      {help ? (
        <button onClick={() => setHelp(false)} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-14 text-(--color-ink)">
          <span role="status" className="flex items-center gap-5 rounded-[2rem] bg-(--color-surface) px-10 py-8 text-3xl font-semibold shadow-2xl">
            <Icon name="info" className="size-10 shrink-0" />
            {t.helpNotice}
          </span>
        </button>
      ) : null}
    </main>
  );
}
