"use client";

import { useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";
import { Icon } from "./icons";

/** The top part of a square tile. A missing or broken photo leaves a flat gap, so tiles stay aligned. */
function Photo({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="min-h-0 w-full flex-[55] bg-(--color-surface-2)" />;
  // Decorative: the name below carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className="min-h-0 w-full flex-[55] object-cover" />;
}

/**
 * "Would you like to add…?", shown once after the first item from a department. The list is fixed when
 * it opens; a tile turns to "Added" as soon as its product is in the order.
 */
export default function SuggestionPanel({
  products, currency, locale, showImages = true, onPick, onClose,
}: {
  products: CatalogProduct[];
  currency: string;
  locale: Locale;
  /** The restaurant can switch product photos off. */
  showImages?: boolean;
  /** A product with choices to make opens its sheet; anything else is added straight away. */
  onPick: (p: CatalogProduct) => void;
  onClose: () => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const isAdded = (p: CatalogProduct) => cart.lines.some((l) => l.articleId === p.id);
  const anyAdded = products.some(isAdded);
  // All-or-nothing, as on the menu: a row where only some tiles have a photo reads as broken.
  const photoSlot = showImages && products.some((p) => p.imageUrl);

  return (
    <div role="dialog" aria-modal="true" aria-label={t.suggestTitle}
      className="fixed inset-0 z-40 flex items-end bg-black/60">
      <div className="flex max-h-[85dvh] w-full flex-col gap-8 overflow-y-auto rounded-t-[3rem] bg-(--color-surface) p-10 shadow-2xl">
        <h2 className="font-display text-5xl leading-tight font-bold">{t.suggestTitle}</h2>

        <ul className="grid grid-cols-2 gap-5">
          {products.map((p) => {
            const added = isAdded(p);
            return (
              <li key={p.id}>
                <button onClick={() => onPick(p)} disabled={added}
                  className="flex aspect-square w-full flex-col overflow-hidden rounded-(--radius-card) border-[3px] border-(--color-line) bg-(--color-page) text-start disabled:opacity-80">
                  {photoSlot ? <Photo src={p.imageUrl} /> : null}
                  <span className="flex min-h-0 flex-[45] flex-col justify-between gap-2 p-5">
                    <span className="line-clamp-2 font-display text-3xl leading-tight font-bold break-words">{p.name}</span>
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-display text-3xl font-bold tabular-nums text-(--color-brand-deep)">
                        {p.pricing === "SIZE" ? t.chooseSize : money(p.price ?? 0, currency, locale)}
                      </span>
                      {added ? (
                        <span className="flex items-center gap-2 rounded-full bg-(--color-brand-soft) px-4 py-2 text-2xl font-bold text-(--color-brand-deep)">
                          <Icon name="check" className="size-7" strokeWidth={3} />
                          {t.added}
                        </span>
                      ) : (
                        <span className="flex size-16 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                          <Icon name="plus" className="size-8" strokeWidth={2.6} />
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button onClick={onClose}
          className={`min-h-28 rounded-full font-display text-4xl font-bold ${
            anyAdded ? "bg-(--color-brand) text-(--color-brand-ink)" : "bg-(--color-brand-soft) text-(--color-brand-deep)"
          }`}>
          {anyAdded ? t.done : t.noThanks}
        </button>
      </div>
    </div>
  );
}
