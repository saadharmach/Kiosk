"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IMAGE_TYPES, MAX_WELCOME_SLIDES, SLIDE_TYPES, getBranding, slidesBody, updateBranding, uploadBrandingImage,
  type Branding, type Slide,
} from "@/lib/branding";
import { LOCALES, listProducts, type AdminProduct, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const hint = "mt-1 text-xs text-(--color-ink-muted)";
const btn = "h-10 rounded-lg px-4 font-medium disabled:opacity-50";
const primary = `${btn} bg-(--color-brand) text-(--color-brand-ink)`;
const secondary = `${btn} border border-(--color-line)`;
const small = "h-9 rounded-lg border border-(--color-line) px-3 text-sm disabled:opacity-40";

/** Picks the product a slide shows: type part of its name, tap it. */
function ProductPicker({ slug, onPick, onCancel }: { slug: string; onPick: (p: AdminProduct) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<AdminProduct[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const id = setTimeout(() => {
      listProducts(slug, { search: q.trim(), pageSize: "8" }).then((r) => setFound(r.products.filter((p) => !p.isMenu))).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(id);
  }, [slug, q]);
  return (
    <div className="mt-3 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) p-3">
      <div className="flex gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type part of the product's name"
          className="h-10 flex-1 rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
        <button type="button" className={small} onClick={onCancel}>Cancel</button>
      </div>
      {found.length ? (
        <ul className="mt-2 flex flex-col">
          {found.map((p) => (
            <li key={p.articleId}>
              <button type="button" onClick={() => onPick(p)} className="w-full rounded-md px-3 py-2 text-start hover:bg-(--color-surface)">
                {p.displayName?.fr || p.posName} <span className="text-xs text-(--color-ink-muted)">({p.posName})</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? <p className={hint}>No product found.</p> : null}
    </div>
  );
}

/** The restaurant's logo, its welcome-screen adverts (photos or videos, each may show a product) and its two lines. */
export default function BrandingPage({ slug }: { slug: string }) {
  const [b, setB] = useState<Branding | null>(null);
  const [tagline, setTagline] = useState<I18n>({});
  const [subtitle, setSubtitle] = useState<I18n>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = useCallback((next: Branding) => { setB(next); setTagline(next.tagline ?? {}); setSubtitle(next.subtitle ?? {}); }, []);
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

  const slides = b.welcomeSlides;
  const save = (next: Slide[], done?: string) => run(() => updateBranding(slug, { welcomeSlides: slidesBody(next) }), done);
  const move = (i: number, by: number) => {
    const next = [...slides];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    return save(next);
  };
  const setProduct = (path: string, productId: string | null) =>
    save(slides.map((x) => (x.path === path ? { ...x, productId } : x)), productId ? "The product will show on this slide." : "Product removed from the slide.");

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

      {/* ---- welcome adverts */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Welcome screen adverts</h2>
        <p className="mb-4 text-sm text-(--color-ink-muted)">
          Photos or videos (offers, new dishes, adverts), shown large on the welcome screen one after another: a photo
          for 6 seconds, a video until its end (it plays without sound). Up to {MAX_WELCOME_SLIDES}. Use tall pictures
          (portrait, for example 1080 × 1350) — the kiosk screen is upright. Photos 8 MB at most, videos (MP4 or WebM) 50 MB.
          A slide can also show one of your products with its menu price.
        </p>
        {slides.length === 0 ? <p className="mb-4 text-sm text-(--color-ink-muted)">No adverts yet.</p> : (
          <ol className="mb-4 flex flex-col gap-3">
            {slides.map((w, i) => (
              <li key={w.path} className="flex flex-wrap items-center gap-4 rounded-lg border border-(--color-line) bg-(--color-surface) p-3">
                <span className="w-6 text-center text-sm text-(--color-ink-muted)">{i + 1}</span>
                {w.url ? (w.kind === "video"
                  ? <video src={w.url} muted playsInline loop autoPlay aria-label={`Video ${i + 1}`} className="h-24 w-20 rounded-lg bg-black object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={w.url} alt={`Photo ${i + 1}`} className="h-24 w-20 rounded-lg object-cover" />) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <span className="text-(--color-ink-muted)">{w.kind === "video" ? "Video" : "Photo"}</span>
                  {w.productId ? (
                    <span>Shows <b>{w.productName ?? "a product no longer on the menu"}</b> with its price
                      {" · "}<button type="button" className="underline" disabled={busy} onClick={() => setPicking(w.path)}>Change</button>
                      {" · "}<button type="button" className="underline" disabled={busy} onClick={() => void setProduct(w.path, null)}>Remove</button>
                    </span>
                  ) : (
                    <button type="button" className="self-start underline" disabled={busy} onClick={() => setPicking(w.path)}>Show a product on this slide</button>
                  )}
                </span>
                <button type="button" className={small} disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`Move slide ${i + 1} up`}>↑</button>
                <button type="button" className={small} disabled={busy || i === slides.length - 1} onClick={() => void move(i, 1)} aria-label={`Move slide ${i + 1} down`}>↓</button>
                <button type="button" className="text-sm text-(--color-danger) underline" disabled={busy}
                  onClick={() => window.confirm(`Remove slide ${i + 1}?`) && void save(slides.filter((x) => x.path !== w.path), "Slide removed.")}>
                  Remove
                </button>
                {picking === w.path ? (
                  <ProductPicker slug={slug} onCancel={() => setPicking(null)}
                    onPick={(p) => { setPicking(null); void setProduct(w.path, p.articleId); }} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {slides.length < MAX_WELCOME_SLIDES ? (
          <label className={`${secondary} inline-flex cursor-pointer items-center ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy ? "Uploading…" : "Add a photo or video"}
            <input type="file" accept={SLIDE_TYPES} className="sr-only" disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]; e.target.value = "";
                if (file) void run(async () => updateBranding(slug, { welcomeSlides: [...slidesBody(slides), { path: await uploadBrandingImage(slug, "welcome", file) }] }), "Advert added.");
              }} />
          </label>
        ) : <p className={hint}>That is the maximum. Remove one to add another.</p>}
      </section>

      {/* ---- the two lines */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-medium">Welcome texts</h2>
        <p className="mb-4 text-sm text-(--color-ink-muted)">
          Shown over the advert, under the restaurant&apos;s name: a short big line (for example “Le goût du fait maison.”)
          and a smaller one under it. In each language; leave a language empty to show nothing in it.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Big line</p>
            {LOCALES.map((l) => (
              <div key={l} className="mb-3">
                <label className="mb-1 block text-xs text-(--color-ink-muted)" htmlFor={`tagline-${l}`}>{LABEL[l]}</label>
                <input id={`tagline-${l}`} maxLength={120} dir={l === "ar" ? "rtl" : "ltr"} value={tagline[l] ?? ""}
                  onChange={(e) => setTagline({ ...tagline, [l]: e.target.value })}
                  className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Smaller line</p>
            {LOCALES.map((l) => (
              <div key={l} className="mb-3">
                <label className="mb-1 block text-xs text-(--color-ink-muted)" htmlFor={`subtitle-${l}`}>{LABEL[l]}</label>
                <input id={`subtitle-${l}`} maxLength={120} dir={l === "ar" ? "rtl" : "ltr"} value={subtitle[l] ?? ""}
                  onChange={(e) => setSubtitle({ ...subtitle, [l]: e.target.value })}
                  className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
              </div>
            ))}
          </div>
        </div>
        <button type="button" className={primary} disabled={busy}
          onClick={() => void run(() => updateBranding(slug, { tagline, subtitle }), "Saved.")}>
          Save
        </button>
      </section>
    </div>
  );
}
