"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IMAGE_TYPES, MAX_WELCOME_SLIDES, SLIDE_TYPES, getBranding, slidesBody, updateBranding, uploadBrandingImage,
  type Branding, type Slide,
} from "@/lib/branding";
import { LOCALES, listProducts, type AdminProduct, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "Anglais", ar: "Arabe" };
const card = "card";
const hint = "mt-1 text-[12.5px] text-(--color-ink-muted)";
const primary = "btn btn-primary";
const secondary = "btn btn-secondary";
const small = "btn btn-secondary btn-sm w-9";

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
    <div className="mt-3 w-full rounded-(--radius-card) border border-(--color-line) bg-(--color-page) p-3">
      <div className="flex gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tapez une partie du nom de l’article"
          className="field flex-1" />
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
      </div>
      {found.length ? (
        <ul className="mt-2 flex flex-col">
          {found.map((p) => (
            <li key={p.articleId}>
              <button type="button" onClick={() => onPick(p)} className="w-full rounded-md px-3 py-2 text-start hover:bg-(--color-surface)">
                {p.displayName?.fr || p.posName} <span className="text-[12px] text-(--color-ink-muted)">({p.posName})</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? <p className={hint}>Aucun article trouvé.</p> : null}
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

  if (!b) return error ? <p className="note note-err">{error}</p> : <p className="text-(--color-ink-muted)">Chargement…</p>;

  const slides = b.welcomeSlides;
  const save = (next: Slide[], done?: string) => run(() => updateBranding(slug, { welcomeSlides: slidesBody(next) }), done);
  const move = (i: number, by: number) => {
    const next = [...slides];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    return save(next);
  };
  const setProduct = (path: string, productId: string | null) =>
    save(slides.map((x) => (x.path === path ? { ...x, productId } : x)), productId ? "L’article s’affichera sur ce visuel." : "Article retiré du visuel.");
  const first = slides[0];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {error ? <p role="alert" className="note note-err">{error}</p> : null}
        {notice ? <p role="status" className="note note-ok">{notice}</p> : null}

        {/* ---- welcome adverts */}
        <section className={card}>
          <h2 className="card-title mb-1">Visuels de l’écran d’accueil</h2>
          <p className="mb-4 text-(--color-ink-muted)">
            Photos ou vidéos (offres, nouveautés, publicités), affichées en grand sur l’écran d’accueil l’une après l’autre : une photo
            6 secondes, une vidéo jusqu’à la fin (sans le son). {MAX_WELCOME_SLIDES} au plus. Utilisez des images en hauteur (portrait, par
            exemple 1080 × 1350) : l’écran de la borne est vertical. Photos 8 Mo au plus, vidéos (MP4 ou WebM) 50 Mo. Un visuel peut aussi
            montrer un de vos articles avec son prix.
          </p>
          {slides.length === 0 ? <p className="mb-4 text-(--color-ink-muted)">Pas encore de visuel.</p> : (
            <ol className="mb-4 flex flex-col">
              {slides.map((w, i) => (
                <li key={w.path} className="flex flex-wrap items-center gap-3 border-b border-(--color-line) py-2.5 last:border-0">
                  {w.url ? (w.kind === "video"
                    ? <video src={w.url} muted playsInline loop autoPlay aria-label={`Vidéo ${i + 1}`} className="h-16 w-13 rounded-md border border-(--color-line) bg-black object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={w.url} alt={`Photo ${i + 1}`} className="h-16 w-13 rounded-md border border-(--color-line) object-cover" />) : null}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-bold">{w.productName ?? (w.kind === "video" ? "Vidéo" : "Photo")}</span>
                    <small className="text-(--color-ink-muted)">{w.kind === "video" ? "Vidéo" : "Image"} · ordre {i + 1}</small>
                    {w.productId ? (
                      <span className="text-[12.5px]">Affiche <b>{w.productName ?? "un article qui n’est plus au menu"}</b> avec son prix
                        {" · "}<button type="button" className="text-(--color-brand) hover:underline" disabled={busy} onClick={() => setPicking(w.path)}>Changer</button>
                        {" · "}<button type="button" className="text-(--color-brand) hover:underline" disabled={busy} onClick={() => void setProduct(w.path, null)}>Retirer</button>
                      </span>
                    ) : (
                      <button type="button" className="self-start text-[12.5px] text-(--color-brand) hover:underline" disabled={busy} onClick={() => setPicking(w.path)}>
                        Afficher un article sur ce visuel
                      </button>
                    )}
                  </span>
                  <button type="button" className={small} disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`Monter le visuel ${i + 1}`}>↑</button>
                  <button type="button" className={small} disabled={busy || i === slides.length - 1} onClick={() => void move(i, 1)} aria-label={`Descendre le visuel ${i + 1}`}>↓</button>
                  <button type="button" className="btn btn-ghost btn-sm text-(--color-danger)" disabled={busy}
                    onClick={() => window.confirm(`Retirer le visuel ${i + 1} ?`) && void save(slides.filter((x) => x.path !== w.path), "Visuel retiré.")}>
                    Retirer
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
            <label className={`${secondary} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {busy ? "Envoi…" : "Ajouter un visuel"}
              <input type="file" accept={SLIDE_TYPES} className="sr-only" disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (file) void run(async () => updateBranding(slug, { welcomeSlides: [...slidesBody(slides), { path: await uploadBrandingImage(slug, "welcome", file) }] }), "Visuel ajouté.");
                }} />
            </label>
          ) : <p className={hint}>C’est le maximum. Retirez-en un pour en ajouter un autre.</p>}
        </section>

        {/* ---- the two lines */}
        <section className={card}>
          <h2 className="card-title mb-1">Textes d’accueil</h2>
          <p className="mb-4 text-(--color-ink-muted)">
            Affichés sur le visuel, sous le nom du restaurant : une grande ligne courte (par exemple « Le goût du fait maison. ») et une plus
            petite en dessous. Dans chaque langue ; laissez une langue vide pour ne rien y afficher.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="font-bold">Grande ligne</p>
              {LOCALES.map((l) => (
                <div key={l}>
                  <label className="field-label" htmlFor={`tagline-${l}`}>{LABEL[l]}</label>
                  <input id={`tagline-${l}`} maxLength={120} dir={l === "ar" ? "rtl" : "ltr"} value={tagline[l] ?? ""}
                    onChange={(e) => setTagline({ ...tagline, [l]: e.target.value })} className="field" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <p className="font-bold">Petite ligne</p>
              {LOCALES.map((l) => (
                <div key={l}>
                  <label className="field-label" htmlFor={`subtitle-${l}`}>{LABEL[l]}</label>
                  <input id={`subtitle-${l}`} maxLength={120} dir={l === "ar" ? "rtl" : "ltr"} value={subtitle[l] ?? ""}
                    onChange={(e) => setSubtitle({ ...subtitle, [l]: e.target.value })} className="field" />
                </div>
              ))}
            </div>
          </div>
          <button type="button" className={`${primary} mt-4`} disabled={busy}
            onClick={() => void run(() => updateBranding(slug, { tagline, subtitle }), "Enregistré.")}>
            Enregistrer
          </button>
        </section>

        {/* ---- logo */}
        <section className={card}>
          <h2 className="card-title mb-1">Logo du restaurant</h2>
          <p className="mb-4 text-(--color-ink-muted)">
            Affiché sur l’écran d’accueil de la borne et dans la barre en haut de chaque écran. Une image carrée sur fond uni rend le mieux
            (un PNG à fond transparent est idéal).
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-24 items-center justify-center overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-white">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="Logo actuel" className="size-full object-contain" />
              ) : <span className="text-[12.5px] text-[#5f6f83]">Pas de logo</span>}
            </span>
            <label className={`${primary} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
              {b.logoUrl ? "Remplacer le logo" : "Envoyer un logo"}
              <input type="file" accept={IMAGE_TYPES} className="sr-only" disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (file) void run(async () => updateBranding(slug, { logoPath: await uploadBrandingImage(slug, "logo", file) }), "Logo enregistré.");
                }} />
            </label>
            {b.logoUrl ? (
              <button type="button" className="btn btn-ghost text-(--color-danger)" disabled={busy}
                onClick={() => window.confirm("Retirer le logo ?") && void run(() => updateBranding(slug, { logoPath: null }), "Logo retiré.")}>
                Retirer
              </button>
            ) : null}
          </div>
        </section>
      </div>

      {/* ---- what the welcome screen looks like, roughly */}
      <aside className="card lg:sticky lg:top-24">
        <h2 className="card-title">Aperçu de la borne</h2>
        <div className="mx-auto max-w-[260px] rounded-[14px] bg-(--color-nav) p-3">
          <div className="relative flex aspect-9/16 flex-col justify-end gap-2.5 overflow-hidden rounded-lg bg-[linear-gradient(#073b4c,#00a896)] p-4 text-white">
            {first?.url ? (first.kind === "video"
              ? <video src={first.url} muted playsInline loop autoPlay aria-hidden className="absolute inset-0 size-full object-cover" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={first.url} alt="" className="absolute inset-0 size-full object-cover" />) : null}
            <span className="absolute inset-0 bg-[linear-gradient(transparent_40%,rgba(0,0,0,0.75))]" />
            <b className="relative text-lg leading-tight text-[#ffd27a]">{first?.productName ?? tagline.fr ?? "Votre restaurant"}</b>
            {subtitle.fr ? <span className="relative text-[12px] text-white/85">{subtitle.fr}</span> : null}
            <span className="relative rounded-lg bg-[#f26a21] p-2.5 text-center text-[12px] font-bold">COMMENCER MA COMMANDE</span>
          </div>
        </div>
        <p className="mt-3 text-center text-[12.5px] text-(--color-ink-muted)">Un aperçu simplifié du premier visuel : la borne fait défiler tous les visuels.</p>
      </aside>
    </div>
  );
}
