"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IMAGE_TYPES, MAX_WELCOME_IMAGES, getBranding, updateBranding, uploadBrandingImage, type Branding,
} from "@/lib/branding";
import { LOCALES, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const hint = "mt-1 text-xs text-(--color-ink-muted)";
const btn = "h-10 rounded-lg px-4 font-medium disabled:opacity-50";
const primary = `${btn} bg-(--color-brand) text-(--color-brand-ink)`;
const secondary = `${btn} border border-(--color-line)`;
const small = "h-9 rounded-lg border border-(--color-line) px-3 text-sm disabled:opacity-40";

/** The restaurant's logo, its welcome-screen photos (offers, adverts) and the line under its name. */
export default function BrandingPage({ slug }: { slug: string }) {
  const [b, setB] = useState<Branding | null>(null);
  const [tagline, setTagline] = useState<I18n>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = useCallback((next: Branding) => { setB(next); setTagline(next.tagline ?? {}); }, []);
  useEffect(() => { getBranding(slug).then(adopt).catch((e) => setError((e as Error).message)); }, [slug, adopt]);

  const run = async (fn: () => Promise<Branding | void>, done?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await fn();
      if (next) adopt(next);
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!b) return error ? <p className="text-(--color-danger)">{error}</p> : <p className="text-(--color-ink-muted)">Loading…</p>;

  const paths = b.welcomeImages.map((w) => w.path);
  const move = (i: number, by: number) => {
    const next = [...paths];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return run(() => updateBranding(slug, { welcomeImagePaths: next }));
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {error ? <p role="alert" className="text-(--color-danger)">{error}</p> : null}
      {notice ? <p role="status" className="text-green-700">{notice}</p> : null}

      {/* ---- logo */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Logo</h2>
        <p className="mb-4 text-sm text-(--color-ink-muted)">
          Shown on the kiosk&apos;s welcome screen and in the bar at the top of every screen. A square image on a plain
          background works best (PNG with a transparent background is ideal).
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-(--color-line) bg-white">
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt="Current logo" className="size-full object-contain" />
            ) : <span className="text-sm text-(--color-ink-muted)">No logo</span>}
          </span>
          <label className={`${primary} inline-flex cursor-pointer items-center ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {b.logoUrl ? "Replace the logo" : "Upload a logo"}
            <input type="file" accept={IMAGE_TYPES} className="sr-only" disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]; e.target.value = "";
                if (file) void run(async () => updateBranding(slug, { logoPath: await uploadBrandingImage(slug, "logo", file) }), "Logo saved.");
              }} />
          </label>
          {b.logoUrl ? (
            <button type="button" className="text-sm text-(--color-danger) underline" disabled={busy}
              onClick={() => window.confirm("Remove the logo?") && void run(() => updateBranding(slug, { logoPath: null }), "Logo removed.")}>
              Remove
            </button>
          ) : null}
        </div>
      </section>

      {/* ---- welcome photos */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Welcome screen photos</h2>
        <p className="mb-4 text-sm text-(--color-ink-muted)">
          Offers, new dishes, adverts: shown large on the welcome screen, one after another (each for 6 seconds). Up to{" "}
          {MAX_WELCOME_IMAGES}. Use wide photos (about 2:1, for example 1600 × 800).
        </p>
        {b.welcomeImages.length === 0 ? <p className="mb-4 text-sm text-(--color-ink-muted)">No photos yet.</p> : (
          <ol className="mb-4 flex flex-col gap-3">
            {b.welcomeImages.map((w, i) => (
              <li key={w.path} className="flex flex-wrap items-center gap-4 rounded-lg border border-(--color-line) bg-(--color-surface) p-3">
                <span className="w-6 text-center text-sm text-(--color-ink-muted)">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.url ? <img src={w.url} alt={`Photo ${i + 1}`} className="h-20 w-40 rounded-lg object-cover" /> : null}
                <span className="flex-1" />
                <button type="button" className={small} disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`Move photo ${i + 1} up`}>↑</button>
                <button type="button" className={small} disabled={busy || i === b.welcomeImages.length - 1} onClick={() => void move(i, 1)} aria-label={`Move photo ${i + 1} down`}>↓</button>
                <button type="button" className="text-sm text-(--color-danger) underline" disabled={busy}
                  onClick={() => window.confirm(`Remove photo ${i + 1}?`) && void run(() => updateBranding(slug, { welcomeImagePaths: paths.filter((p) => p !== w.path) }), "Photo removed.")}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
        {b.welcomeImages.length < MAX_WELCOME_IMAGES ? (
          <label className={`${secondary} inline-flex cursor-pointer items-center ${busy ? "pointer-events-none opacity-50" : ""}`}>
            Add a photo
            <input type="file" accept={IMAGE_TYPES} className="sr-only" disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]; e.target.value = "";
                if (file) void run(async () => updateBranding(slug, { welcomeImagePaths: [...paths, await uploadBrandingImage(slug, "welcome", file)] }), "Photo added.");
              }} />
          </label>
        ) : <p className={hint}>That is the maximum. Remove one to add another.</p>}
      </section>

      {/* ---- tagline */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Line under the name</h2>
        <p className="mb-4 text-sm text-(--color-ink-muted)">A short sentence on the welcome screen, in each language. Leave a language empty to show nothing in it.</p>
        {LOCALES.map((l) => (
          <div key={l} className="mb-3">
            <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor={`tagline-${l}`}>{LABEL[l]}</label>
            <input id={`tagline-${l}`} maxLength={120} dir={l === "ar" ? "rtl" : "ltr"} value={tagline[l] ?? ""}
              onChange={(e) => setTagline({ ...tagline, [l]: e.target.value })}
              className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
          </div>
        ))}
        <button type="button" className={primary} disabled={busy}
          onClick={() => void run(() => updateBranding(slug, { tagline }), "Saved.")}>
          Save
        </button>
      </section>
    </div>
  );
}
