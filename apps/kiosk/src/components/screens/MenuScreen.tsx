"use client";

import { useMemo, useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { Catalog, CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";
import ProductSheet from "../ProductSheet";

export default function MenuScreen({
  catalog, locale, tableNumber, showImages = true, onViewOrder, onBack,
}: {
  catalog: Catalog;
  locale: Locale;
  tableNumber: number | null;
  showImages?: boolean;
  onViewOrder: () => void;
  onBack: () => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const [sheet, setSheet] = useState<CatalogProduct | null>(null);

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

  // Group → Department. unTill's Category level duplicates Group, so it is unused.
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of departments) {
      const id = d.groupName ?? "";
      if (!seen.has(id)) seen.set(id, d.groupName ?? t.other);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [departments, t.other]);

  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const inGroup = useMemo(
    () => departments.filter((d) => (d.groupName ?? "") === groupId),
    [departments, groupId],
  );
  const [categoryId, setCategoryId] = useState<string | null>(inGroup[0]?.id ?? null);

  // Changing group moves to its first department rather than showing nothing.
  const chooseGroup = (id: string) => {
    setGroupId(id);
    const first = departments.find((d) => (d.groupName ?? "") === id);
    setCategoryId(first?.id ?? null);
  };

  const products = useMemo(
    () => sellable.filter((p) => p.categoryId === categoryId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sellable, categoryId],
  );
  // All-or-nothing per department: a grid where half the tiles have a photo and
  // half don't reads as broken rather than sparse.
  const showImageSlot = showImages && products.some((p) => p.imageUrl);
  const open = (p: CatalogProduct) => {
    // Sizes, option groups and allergens all live on the sheet.
    if (p.sizes.length > 0 || p.optionGroups.length > 0 || p.allergens.length > 0) return setSheet(p);
    cart.add({ articleId: p.id, name: p.name, options: [], unitPrice: p.price ?? 0 });
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-(--color-line) p-6">
        <button onClick={onBack} className="min-h-16 rounded-(--radius-card) px-6 text-xl text-(--color-ink-muted)">
          {t.back}
        </button>
        {tableNumber !== null ? (
          <span className="text-xl text-(--color-ink-muted)">{t.table} {tableNumber}</span>
        ) : null}
      </header>

      {groups.length > 1 ? (
        <nav className="flex gap-3 overflow-x-auto border-b border-(--color-line) px-4 pt-4">
          {groups.map((g) => (
            <button key={g.id} onClick={() => chooseGroup(g.id)} aria-pressed={g.id === groupId}
              className={`min-h-16 shrink-0 rounded-t-(--radius-card) px-7 text-2xl font-medium ${
                g.id === groupId
                  ? "bg-(--color-brand) text-(--color-brand-ink)"
                  : "text-(--color-ink-muted)"
              }`}>
              {g.name}
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="flex gap-3 overflow-x-auto border-b border-(--color-line) p-4">
        {inGroup.map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)} aria-pressed={c.id === categoryId}
            className={`min-h-14 shrink-0 rounded-full px-6 text-xl ${
              c.id === categoryId
                ? "bg-(--color-ink) text-(--color-surface)"
                : "bg-(--color-surface-2) text-(--color-ink)"
            }`}>
            {c.name}
          </button>
        ))}
      </nav>

      <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-4 pb-40">
          {products.map((p) => (
            <button key={p.id} onClick={() => open(p)}
              className="flex min-h-44 flex-col overflow-hidden rounded-(--radius-card) bg-(--color-surface-2) text-start">
              {showImageSlot ? (
                p.imageUrl ? (
                  // Decorative: the name below carries the meaning, so alt stays empty.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" loading="lazy"
                    className="aspect-[4/3] w-full object-cover" />
                ) : (
                  // A flat gap, not a placeholder illustration: keeps rows aligned
                  // when only some products in a department have a photo.
                  <div className="aspect-[4/3] w-full bg-(--color-surface)" />
                )
              ) : null}
              <span className="flex flex-1 flex-col justify-between gap-2 p-5">
                <span className="text-2xl font-medium">{p.name}</span>
                <span className="text-2xl tabular-nums text-(--color-ink-muted)">
                  {p.pricing === "SIZE" ? t.chooseSize : money(p.price ?? 0, catalog.currency, locale)}
                </span>
              </span>
            </button>
          ))}
      </div>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-(--color-line) bg-(--color-surface) p-5">
          <button onClick={onViewOrder}
            className="flex min-h-24 w-full items-center justify-between rounded-(--radius-card) bg-(--color-brand) px-8 text-2xl font-medium text-(--color-brand-ink)">
            <span>{cart.count} · {t.viewOrder}</span>
            <span className="tabular-nums">{money(cart.total, catalog.currency, locale)}</span>
          </button>
        </div>
      ) : null}

      {sheet ? (
        <ProductSheet product={sheet} currency={catalog.currency} locale={locale} onClose={() => setSheet(null)} />
      ) : null}
    </main>
  );
}