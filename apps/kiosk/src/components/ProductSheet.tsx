"use client";

import { useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import type { CatalogProduct } from "@/lib/api";
import { useCart } from "@/state/cart";

export default function ProductSheet({
  product, currency, locale, onClose,
}: {
  product: CatalogProduct;
  currency: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const [sizeId, setSizeId] = useState<string | null>(product.sizes[0]?.sizeItemId ?? null);
  const [qty, setQty] = useState(1);

  const size = product.sizes.find((s) => s.sizeItemId === sizeId);
  const unitPrice = size ? size.price : (product.price ?? 0);
  const canAdd = unitPrice > 0 && (product.sizes.length === 0 || Boolean(size));

  const addToCart = () => {
    cart.add(
      {
        articleId: product.id,
        name: product.name,
        sizeItemId: size?.sizeItemId,
        sizeName: size?.name,
        options: [],
        unitPrice,
      },
      qty,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <div className="flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-t-3xl bg-(--color-surface) p-8">
        <h2 className="text-4xl font-semibold">{product.name}</h2>
        {product.description ? (
          <p className="text-2xl text-(--color-ink-muted)">{product.description}</p>
        ) : null}

        {/* The server sends an empty list when the restaurant switches allergens off. */}
        {product.allergens.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-medium">{t.allergens}</p>
            <p className="text-2xl text-(--color-ink-muted)">
              {product.allergens.map((a) => a.name).join(", ")}
            </p>
          </div>
        ) : null}

        {product.sizes.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-2xl font-medium">{t.chooseSize}</p>
            {product.sizes.map((s) => (
              <button key={s.sizeItemId} onClick={() => setSizeId(s.sizeItemId)}
                aria-pressed={s.sizeItemId === sizeId}
                className={`flex min-h-20 items-center justify-between rounded-(--radius-card) border px-6 text-2xl ${
                  s.sizeItemId === sizeId
                    ? "border-transparent bg-(--color-brand) text-(--color-brand-ink)"
                    : "border-(--color-line) bg-(--color-surface-2)"
                }`}>
                <span>{s.name}</span>
                <span className="tabular-nums">{money(s.price, currency, locale)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <span className="text-2xl">{t.quantity}</span>
          <div className="flex items-center gap-4">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="size-20 rounded-full bg-(--color-surface-2) text-4xl">−</button>
            <span className="min-w-16 text-center text-4xl font-semibold tabular-nums">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(99, q + 1))}
              className="size-20 rounded-full bg-(--color-surface-2) text-4xl">+</button>
          </div>
        </div>

        <div className="flex gap-4">
          <button onClick={onClose}
            className="min-h-24 flex-1 rounded-(--radius-card) border border-(--color-line) text-2xl">
            {t.close}
          </button>
          <button onClick={addToCart} disabled={!canAdd}
            className="min-h-24 flex-2 rounded-(--radius-card) bg-(--color-brand) text-3xl font-medium text-(--color-brand-ink) disabled:opacity-40">
            {t.add} · {money(unitPrice * qty, currency, locale)}
          </button>
        </div>
      </div>
    </div>
  );
}