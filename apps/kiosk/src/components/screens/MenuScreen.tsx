"use client";

import { useMemo, useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { Catalog, CatalogAllergen, CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";
import ProductSheet from "../ProductSheet";

/** Background / text pairs for allergen chips, picked by the allergen's number. */
const CHIP_COLORS: [string, string][] = [
  ["#fde2e2", "#7f1d1d"], ["#fef3c7", "#78350f"], ["#dbeafe", "#1e3a8a"],
  ["#fde9d2", "#7c2d12"], ["#dcfce7", "#14532d"], ["#ede9fe", "#4c1d95"],
];

function AllergenChip({ a }: { a: CatalogAllergen }) {
  const [bg, fg] = CHIP_COLORS[a.number % CHIP_COLORS.length];
  return (
    <span title={a.name} style={{ background: bg, color: fg }}
      className="flex size-7 items-center justify-center rounded-md font-display text-base font-bold">
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
  const [sheet, setSheet] = useState<CatalogProduct | null>(null);
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
  const open = (p: CatalogProduct) => {
    // Sizes, option groups and allergens all live on the sheet.
    if (p.sizes.length > 0 || p.optionGroups.length > 0 || p.allergens.length > 0) return setSheet(p);
    cart.add({ articleId: p.id, name: p.name, imageUrl: p.imageUrl, options: [], unitPrice: p.price ?? 0 });
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} onBack={onBack} backLabel={t.back}
        extra={tableNumber !== null ? (
          <span className="rounded-xl bg-(--color-navy-2) px-5 py-3 font-display text-3xl font-semibold">
            {t.table} {tableNumber}
          </span>
        ) : null} />

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Categories" className="w-52 shrink-0 overflow-y-auto bg-(--color-line) px-3 py-7 pb-44">
          <div className="flex flex-col gap-3">
            {departments.map((c) => (
              <button key={c.id} onClick={() => setCategoryId(c.id)} aria-pressed={c.id === categoryId}
                className={`min-h-20 rounded-3xl px-5 text-start font-display text-2xl leading-tight font-semibold break-words ${
                  c.id === categoryId ? "bg-(--color-brand) text-(--color-brand-ink)" : "bg-(--color-surface)"
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        </nav>

        <section className="min-w-0 flex-1 overflow-y-auto px-4 pt-9 pb-44">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="font-display text-6xl leading-tight font-bold">{category?.name}</h1>
            <span className="shrink-0 text-2xl font-medium text-(--color-ink-muted)">
              {t.itemsCount.replace("{n}", String(products.length))}
            </span>
          </div>

          <div className="mt-8 grid grid-cols-4 content-start gap-3">
            {products.map((p) => (
              <button key={p.id} onClick={() => open(p)}
                className="flex aspect-square flex-col overflow-hidden rounded-(--radius-card) bg-(--color-surface) text-start shadow-md">
                {showImageSlot ? (
                  hasPhoto(p) ? (
                    // Decorative: the name below carries the meaning, so alt stays empty.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl ?? undefined} alt="" loading="lazy" className="min-h-0 w-full flex-[55] object-cover"
                      onError={() => setBrokenImages((s) => new Set(s).add(p.id))} />
                  ) : (
                    // A flat gap, not a placeholder illustration: keeps rows aligned
                    // when only some products in a department have a photo.
                    <div className="min-h-0 w-full flex-[55] bg-(--color-surface-2)" />
                  )
                ) : null}
                <span className={`flex min-h-0 flex-[45] flex-col justify-between gap-1 overflow-hidden ${showImageSlot ? "p-2.5" : "p-3"}`}>
                  <span className={`line-clamp-2 font-display leading-tight font-bold break-words ${showImageSlot ? "text-base" : "text-lg"}`}>{p.name}</span>
                  <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="font-display text-xl font-bold tabular-nums text-(--color-brand-deep)">
                      {p.pricing === "SIZE" ? t.chooseSize : money(p.price ?? 0, catalog.currency, locale)}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {p.allergens.map((a) => <AllergenChip key={a.id} a={a} />)}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 flex h-40 items-center justify-between bg-(--color-navy) px-12 text-white">
          <div className="flex items-center gap-6">
            <span className="relative flex size-24 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
              <Icon name="bag" className="size-11" strokeWidth={1.8} />
              <span className="absolute -top-1.5 -end-1.5 flex h-10 min-w-10 items-center justify-center rounded-full bg-red-500 px-2 font-display text-2xl font-bold text-white">
                {cart.count}
              </span>
            </span>
            <span className="font-display text-5xl font-bold tabular-nums">
              {money(cart.total, catalog.currency, locale)}
            </span>
          </div>
          <button onClick={onViewOrder}
            className="flex h-24 items-center gap-4 rounded-full bg-(--color-brand) px-11 font-display text-4xl font-bold text-(--color-brand-ink)">
            <span>{t.viewOrder}</span>
            <Icon name="chevron" className="size-9 rtl:-scale-x-100" strokeWidth={2.4} />
          </button>
        </div>
      ) : null}

      {sheet ? (
        <ProductSheet product={sheet} currency={catalog.currency} locale={locale} onClose={() => setSheet(null)} />
      ) : null}
    </main>
  );
}
