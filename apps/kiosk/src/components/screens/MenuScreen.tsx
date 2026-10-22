"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { Catalog, CatalogAllergen, CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";
import ProductSheet from "../ProductSheet";
import SuggestionPanel from "../SuggestionPanel";
import { pickSuggestions } from "@/lib/suggestions";

/** Background / text pairs for allergen chips, picked by the allergen's number. */
const CHIP_COLORS: [string, string][] = [
  ["#fde2e2", "#7f1d1d"], ["#fef3c7", "#78350f"], ["#dbeafe", "#1e3a8a"],
  ["#fde9d2", "#7c2d12"], ["#dcfce7", "#14532d"], ["#ede9fe", "#4c1d95"],
];

/** A category on the left rail: its photo if it has one, else its first letter in a soft circle. */
function CategoryThumb({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // Decorative: the name below carries the meaning.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setFailed(true)} className="size-24 rounded-3xl object-cover" />;
  }
  return (
    <span className="flex size-24 items-center justify-center rounded-3xl bg-(--color-surface-2) font-display text-6xl font-extrabold text-(--color-brand-deep) uppercase">
      {Array.from(name)[0]}
    </span>
  );
}

function AllergenChip({ a }: { a: CatalogAllergen }) {
  const [bg, fg] = CHIP_COLORS[a.number % CHIP_COLORS.length];
  return (
    <span title={a.name} style={{ background: bg, color: fg }}
      className="flex size-8 items-center justify-center rounded-lg font-display text-xl font-extrabold">
      {Array.from(a.name)[0]?.toUpperCase()}
    </span>
  );
}

export default function MenuScreen({
  catalog, locale, name, tableNumber, showImages = true, onLocale, onViewOrder, onBack,
}: {
  catalog: Catalog;
  locale: Locale;
  name: string;
  tableNumber: number | null;
  showImages?: boolean;
  onLocale: (l: Locale) => void;
  onViewOrder: () => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  // The cart bar pulses once when something is added, and a green message says what (1.8 s).
  const [pulse, setPulse] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const lastCount = useRef(cart.count);
  useEffect(() => {
    if (cart.count > lastCount.current) setPulse((n) => n + 1);
    lastCount.current = cart.count;
  }, [cart.count]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);
  const flash = (name: string) => setToast({ id: Date.now(), text: t.addedItem.replace("{name}", name) });
  const [sheet, setSheet] = useState<CatalogProduct | null>(null);
  // "Would you like to add…?": the products on offer, and whether the open sheet was reached from it.
  const [offer, setOffer] = useState<CatalogProduct[] | null>(null);
  const [sheetFromOffer, setSheetFromOffer] = useState(false);
  // Products whose image failed to load: shown as having no photo.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());
  const hasPhoto = (p: CatalogProduct) => Boolean(p.imageUrl) && !brokenImages.has(p.id);

  // MENU products are hidden: unTill gives them no price and no required-choice
  // count, so the kiosk cannot price them. Remove this filter once unTill answers.
  const sellable = useMemo(
    () => catalog.products.filter((p) => p.visible && p.pricing !== "MENU" && p.pricing !== "UNPRICED"),
    [catalog.products],
  );

  const departments = useMemo(() => {
    const used = new Set(sellable.map((p) => p.categoryId));
    return catalog.categories
      .filter((c) => c.visible && used.has(c.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [catalog.categories, sellable]);

  // All-or-nothing, as for products: a rail where only some categories have a photo reads as broken. With no photo at
  // all, the rail is just names (a letter in a circle would be filler).
  const categoryPhotos = showImages && departments.some((c) => c.imageUrl);
  // Departments only: unTill's Group and Category levels are not shown on the kiosk.
  const [categoryId, setCategoryId] = useState<string | null>(departments[0]?.id ?? null);
  const category = departments.find((c) => c.id === categoryId) ?? null;

  const products = useMemo(
    () => sellable.filter((p) => p.categoryId === categoryId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sellable, categoryId],
  );
  // All-or-nothing per department: a grid where half the tiles have a photo and
  // half don't reads as broken rather than sparse.
  const showImageSlot = showImages && products.some(hasPhoto);
  /**
   * After something is added (not from the suggestions themselves): offer that department's own suggestions. Every
   * time: "No thanks" only closes this offer, the next product added offers again. What is already in the order is
   * left out, so once everything suggested has been taken, nothing more is offered.
   */
  const offerAfterAdding = (p: CatalogProduct) => {
    if (!p.categoryId) return;
    const picks = pickSuggestions(catalog, p.categoryId, [...cart.lines.map((l) => l.articleId), p.id]);
    if (picks.length === 0) return;
    setOffer(picks);
  };

  const open = (p: CatalogProduct, fromOffer = false) => {
    // Sizes, option groups and allergens all live on the sheet.
    if (p.sizes.length > 0 || p.optionGroups.length > 0 || p.allergens.length > 0) {
      setSheetFromOffer(fromOffer);
      return setSheet(p);
    }
    cart.add({ articleId: p.id, name: p.name, imageUrl: p.imageUrl, options: [], unitPrice: p.price ?? 0 });
    flash(p.name);
    if (!fromOffer) offerAfterAdding(p);
  };

  /** A product that needs choices (sizes, options) or shows allergens opens its sheet; any other adds at a tap. */
  const complex = (p: CatalogProduct) => p.sizes.length > 0 || p.optionGroups.length > 0 || p.allergens.length > 0;
  const plainLine = (p: CatalogProduct) => cart.lines.find((l) => l.articleId === p.id && !l.sizeItemId && l.options.length === 0);
  const countOf = (p: CatalogProduct) => cart.lines.filter((l) => l.articleId === p.id).reduce((n, l) => n + l.quantity, 0);
  const fromPrice = (p: CatalogProduct) => (p.sizes.length > 0 ? Math.min(...p.sizes.map((x) => x.price)) : null);

  const empty = cart.count === 0;
  return (
    <main className="flex h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} onBack={onBack} backLabel={t.back}
        extra={tableNumber !== null ? (
          <span className="rounded-full bg-(--color-surface-2) px-6 py-3 font-display text-3xl font-extrabold tracking-wide text-(--color-brand-deep) uppercase">
            {t.table} {tableNumber}
          </span>
        ) : null} />

      {/* ---- the cart, always in view: how many, how much, and the way to it */}
      <div className="shrink-0 px-12 pb-4">
        <div key={pulse} className={`flex h-32 items-center justify-between gap-6 rounded-[2.25rem] bg-(--color-anthracite) ps-10 pe-5 text-white shadow-lg ${pulse ? "bar-pulse" : ""}`}>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-white/75">
              {empty ? t.cartEmpty : t.articlesCount.replace("{n}", String(cart.count))}
            </span>
            <span className="font-display text-6xl leading-none font-extrabold tabular-nums">{money(cart.total, catalog.currency, locale)}</span>
          </div>
          <button onClick={onViewOrder} disabled={empty}
            className="flex h-24 items-center gap-4 rounded-full bg-(--color-brand) px-10 font-display text-4xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase disabled:bg-white/15 disabled:text-white/50">
            <span>{t.viewOrder}</span>
            <Icon name="chevron" className="size-9 rtl:-scale-x-100" strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Categories" className="w-48 shrink-0 overflow-y-auto px-3 pt-2 pb-8">
          <div className="flex flex-col gap-3">
            {departments.map((c) => {
              const on = c.id === categoryId;
              return (
                <button key={c.id} onClick={() => setCategoryId(c.id)} aria-pressed={on}
                  className={`flex flex-col items-center gap-2 rounded-[2rem] border-4 px-2 py-4 text-center ${
                    on ? "border-(--color-brand) bg-(--color-surface-2)" : "border-transparent bg-(--color-surface) shadow-sm"
                  }`}>
                  {categoryPhotos ? <CategoryThumb src={c.imageUrl ?? null} name={c.name} /> : null}
                  <span className={`font-display text-3xl leading-tight font-bold break-words ${categoryPhotos ? "" : "my-auto py-3"} ${on ? "text-(--color-brand-deep)" : ""}`}>{c.name}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <section className={`min-w-0 flex-1 overflow-y-auto ps-3 pe-12 pt-2 ${offer ? "pb-[26rem]" : "pb-16"}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="font-display text-8xl leading-none font-extrabold">{category?.name}</h1>
            <span className="shrink-0 text-2xl font-semibold text-(--color-ink-muted)">
              {t.itemsCount.replace("{n}", String(products.length))}
            </span>
          </div>

          <div className="mt-8 grid grid-cols-2 content-start gap-6">
            {products.map((p) => {
              const n = countOf(p);
              const line = plainLine(p);
              const from = fromPrice(p);
              return (
                <div key={p.id}
                  className={`relative flex flex-col overflow-hidden rounded-[2rem] bg-(--color-surface) shadow-md ${n > 0 ? "ring-4 ring-(--color-brand)" : ""}`}>
                  <button onClick={() => open(p)} className="flex flex-col text-start">
                    {showImageSlot ? (
                      hasPhoto(p) ? (
                        // Decorative: the name below carries the meaning, so alt stays empty.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl ?? undefined} alt="" loading="lazy" className="h-64 w-full object-cover"
                          onError={() => setBrokenImages((s) => new Set(s).add(p.id))} />
                      ) : (
                        // A flat soft gap, not a placeholder illustration: keeps rows aligned
                        // when only some products in a department have a photo.
                        <div className="h-64 w-full bg-(--color-surface-2)" />
                      )
                    ) : null}
                    <span className="flex flex-col gap-2 px-6 pt-5">
                      <span className="line-clamp-2 min-h-[2.2em] font-display text-4xl leading-[1.05] font-bold break-words">{p.name}</span>
                      {p.allergens.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">{p.allergens.map((a) => <AllergenChip key={a.id} a={a} />)}</span>
                      ) : null}
                    </span>
                  </button>

                  {n > 0 ? (
                    <span key={n} className="pill-pop absolute end-4 top-4 flex size-16 items-center justify-center rounded-full bg-(--color-brand) font-display text-4xl font-extrabold text-(--color-brand-ink) shadow-lg">{n}</span>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-6 pt-3 pb-5">
                    <span className="font-display text-5xl leading-none font-extrabold tabular-nums">
                      {from !== null ? <><span className="me-2 text-2xl font-bold">{t.fromPrice}</span>{money(from, catalog.currency, locale)}</> : money(p.price ?? 0, catalog.currency, locale)}
                    </span>
                    {complex(p) ? (
                      <button onClick={() => open(p)}
                        className="h-20 shrink-0 rounded-full bg-(--color-brand) px-8 font-display text-3xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
                        {t.choose}
                      </button>
                    ) : line ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-(--color-surface-2) p-1.5">
                        <button onClick={() => cart.setQty(line.key, line.quantity - 1)} aria-label="−"
                          className="flex size-18 items-center justify-center rounded-full bg-(--color-surface) shadow-sm">
                          <Icon name="minus" className="size-8" strokeWidth={3} />
                        </button>
                        <span className="min-w-10 text-center font-display text-4xl font-extrabold tabular-nums">{line.quantity}</span>
                        <button onClick={() => cart.setQty(line.key, line.quantity + 1)} aria-label="+"
                          className="flex size-18 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                          <Icon name="plus" className="size-8" strokeWidth={3} />
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => open(p)} aria-label={`+ ${p.name}`}
                        className="flex size-22 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink) shadow-md">
                        <Icon name="plus" className="size-10" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {toast ? (
        <span key={toast.id} role="status" className={`screen-in fixed inset-x-0 z-40 mx-auto flex w-fit max-w-[90%] items-center gap-4 rounded-full bg-(--color-success) px-9 py-5 font-display text-4xl font-bold text-white shadow-xl ${offer ? "bottom-[25rem]" : "bottom-12"}`}>
          <Icon name="check" className="size-9" strokeWidth={3.2} />
          {toast.text}
        </span>
      ) : null}

      {sheet ? (
        <ProductSheet product={sheet} currency={catalog.currency} locale={locale}
          // Adding from the offer does not start another offer.
          onAdded={() => { flash(sheet.name); if (!sheetFromOffer) offerAfterAdding(sheet); }}
          onClose={() => { setSheet(null); setSheetFromOffer(false); }} />
      ) : null}

      {offer ? (
        <SuggestionPanel products={offer} currency={catalog.currency} locale={locale} showImages={showImages}
          onPick={(p) => open(p, true)} onClose={() => setOffer(null)} />
      ) : null}
    </main>
  );
}
