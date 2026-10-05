"use client";

import { useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";
import { Icon } from "./icons";

/** The left part of a tile. A missing or broken photo leaves a flat gap, so tiles stay aligned. */
function Photo({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="size-32 shrink-0 bg-(--color-surface-2)" />;
  // Decorative: the name beside it carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className="size-32 shrink-0 object-cover" />;
}

/**
 * "Would you like to add…?", shown once after the first item from a department. The list is fixed when
 * it opens; a tile turns to "Added" as soon as its product is in the order.
 *
 * A strip above the order bar, not a dialog over the menu: the menu stays visible and usable while it is open.
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
    <section aria-label={t.suggestTitle}
      className={`fixed inset-x-0 z-30 flex flex-col gap-4 border-t-4 border-(--color-brand) bg-(--color-surface) px-8 pt-5 pb-6 shadow-[0_-16px_40px_rgba(0,0,0,0.18)] ${
        cart.count > 0 ? "bottom-40" : "bottom-0"
      }`}>
      <div className="flex items-center justify-between gap-6">
        <h2 className="font-display text-3xl leading-tight font-bold">{t.suggestTitle}</h2>
        <button onClick={onClose}
          className={`h-16 shrink-0 rounded-full px-9 font-display text-2xl font-bold ${
            anyAdded ? "bg-(--color-brand) text-(--color-brand-ink)" : "bg-(--color-brand-soft) text-(--color-brand-deep)"
          }`}>
          {anyAdded ? t.done : t.noThanks}
        </button>
      </div>

      <ul className="flex gap-4 overflow-x-auto pb-1">
        {products.map((p) => {
          const added = isAdded(p);
          return (
            <li key={p.id} className="shrink-0">
              <button onClick={() => onPick(p)} disabled={added}
                className="flex h-32 w-96 overflow-hidden rounded-(--radius-card) border-[3px] border-(--color-line) bg-(--color-page) text-start disabled:opacity-80">
                {photoSlot ? <Photo src={p.imageUrl} /> : null}
                <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 p-3">
                  <span className="line-clamp-2 font-display text-xl leading-tight font-bold break-words">{p.name}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-xl font-bold tabular-nums text-(--color-brand-deep)">
                      {p.pricing === "SIZE" ? t.chooseSize : money(p.price ?? 0, currency, locale)}
                    </span>
                    {added ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-(--color-brand-soft) px-3 py-1 text-lg font-bold text-(--color-brand-deep)">
                        <Icon name="check" className="size-5" strokeWidth={3} />
                        {t.added}
                      </span>
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                        <Icon name="plus" className="size-6" strokeWidth={2.6} />
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
