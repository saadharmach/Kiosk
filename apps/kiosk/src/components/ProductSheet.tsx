"use client";

import { useState } from "react";
import { KIND_LABEL, STRINGS, money, type Locale } from "@/i18n";
import type { CatalogOptionGroup, CatalogProduct } from "@/lib/api";
import { isComplete, isExtra, limits, preselected, toggled } from "@/lib/options";
import { useCart } from "@/state/cart";
import { Icon } from "./icons";

const CHIP_COLORS: [string, string][] = [
  ["#fde2e2", "#7f1d1d"], ["#fef3c7", "#78350f"], ["#dbeafe", "#1e3a8a"],
  ["#fde9d2", "#7c2d12"], ["#dcfce7", "#14532d"], ["#ede9fe", "#4c1d95"],
];

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
  const [imageFailed, setImageFailed] = useState(false);
  const photo = product.imageUrl && !imageFailed ? product.imageUrl : null;
  // groupId -> chosen option article ids. A required group with one item is pre-chosen.
  const [picked, setPicked] = useState<Record<string, string[]>>(() => preselected(product.optionGroups));
  // Supplements and condiments start folded away; a customer opens the ones they want.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const size = product.sizes.find((s) => s.sizeItemId === sizeId);
  const chosen = product.optionGroups.flatMap((g) =>
    g.items
      .filter((i) => (picked[g.id] ?? []).includes(i.articleId))
      .map((i) => ({ optionGroupId: g.id, articleId: i.articleId, name: i.name, price: i.price, kind: g.kind })),
  );
  const unitPrice =
    (size ? size.price : (product.price ?? 0)) + chosen.reduce((sum, o) => sum + o.price, 0);
  const groupsDone = product.optionGroups.every((g) => isComplete(g, picked[g.id] ?? []));
  const canAdd =
    unitPrice > 0 && (product.sizes.length === 0 || Boolean(size)) && groupsDone;

  const toggle = (g: CatalogOptionGroup, articleId: string) =>
    setPicked((prev) => ({ ...prev, [g.id]: toggled(g, prev[g.id] ?? [], articleId) }));

  const addToCart = () => {
    cart.add(
      {
        articleId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        sizeItemId: size?.sizeItemId,
        sizeName: size?.name,
        options: chosen,
        unitPrice,
      },
      qty,
    );
    onClose();
  };

  /** A radio circle for single picks, a square tick for "choose N". */
  const marker = (on: boolean, square: boolean) => (
    <span className={`flex size-10 shrink-0 items-center justify-center border-[3px] bg-white ${square ? "rounded-lg" : "rounded-full"} ${
      on ? "border-(--color-brand-deep)" : "border-slate-400"
    }`}>
      {on ? (
        square
          ? <Icon name="check" className="size-6 text-(--color-brand-deep)" strokeWidth={3.5} />
          : <span className="size-5 rounded-full bg-(--color-brand-deep)" />
      ) : null}
    </span>
  );

  const card = (on: boolean) =>
    `flex min-h-28 items-center gap-4 rounded-3xl border-[3px] px-6 text-start ${
      on ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-(--color-line) bg-slate-50"
    }`;

  return (
    <div role="dialog" aria-modal="true" aria-label={product.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="relative flex max-h-[92dvh] w-full max-w-225 flex-col overflow-hidden rounded-[3rem] bg-(--color-surface) shadow-2xl">
        <button onClick={onClose} aria-label={t.close}
          className="absolute end-7 top-7 z-10 flex size-22 items-center justify-center rounded-full bg-(--color-navy)/85 text-white">
          <Icon name="close" className="size-10" strokeWidth={2.4} />
        </button>

        <div className="flex-1 overflow-y-auto">
          {photo ? (
            // Decorative: the name below carries the meaning, so alt stays empty.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-96 w-full object-cover" onError={() => setImageFailed(true)} />
          ) : null}

          <div className="flex flex-col gap-8 p-12">
            <div className={photo ? "" : "pe-24"}>
              <h2 className="font-display text-6xl leading-tight font-bold">{product.name}</h2>
              {product.description ? (
                <p className="mt-3 text-3xl leading-snug text-(--color-ink-muted)">{product.description}</p>
              ) : null}
            </div>

            {/* The server sends an empty list when the restaurant switches allergens off. */}
            {product.allergens.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-2xl font-semibold text-(--color-ink-muted)">{t.allergens}</p>
                <div className="flex flex-wrap gap-3">
                  {product.allergens.map((a) => {
                    const [bg, fg] = CHIP_COLORS[a.number % CHIP_COLORS.length];
                    return (
                      <span key={a.id} style={{ background: bg, color: fg }}
                        className="flex h-14 items-center gap-3 rounded-full ps-2 pe-6 text-2xl font-semibold">
                        <span className="flex size-10 items-center justify-center rounded-full bg-white font-display text-xl font-bold">
                          {Array.from(a.name)[0]?.toUpperCase()}
                        </span>
                        {a.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {product.sizes.length > 0 ? (
              <div className="flex flex-col gap-4 border-t-2 border-(--color-line) pt-8">
                <p className="font-display text-4xl font-bold">{t.chooseSize}</p>
                <div role="radiogroup" aria-label={t.chooseSize} className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
                  {product.sizes.map((s) => {
                    const on = s.sizeItemId === sizeId;
                    return (
                      <button key={s.sizeItemId} role="radio" aria-checked={on} onClick={() => setSizeId(s.sizeItemId)}
                        className={card(on)}>
                        {marker(on, false)}
                        <span className="flex flex-col gap-1">
                          <span className="font-display text-3xl leading-tight font-bold">{s.name}</span>
                          <span className="text-2xl text-(--color-ink-muted) tabular-nums">{money(s.price, currency, locale)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {product.optionGroups.map((g) => {
              const { min, max } = limits(g);
              const multi = max > 1;
              const extra = isExtra(g);
              const isOpen = !extra || open[g.id] === true;
              const count = (picked[g.id] ?? []).length;
              const rule =
                g.requiredChoices !== null ? t.chooseCount.replace("{n}", String(g.requiredChoices)) : min > 0 ? t.required : t.optional;

              const heading = (
                <>
                  <span className="flex min-w-0 flex-col gap-1 text-start">
                    <span className="font-display text-4xl leading-tight font-bold">{g.name}</span>
                    {/* unTill's own name for what kind of option this is */}
                    <span className="text-2xl font-semibold tracking-wide text-(--color-ink-muted)">{KIND_LABEL(g.kind, t)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-4">
                    <span className="rounded-full bg-(--color-brand-soft) px-5 py-2 text-2xl font-bold text-(--color-brand-deep)">
                      {extra && count > 0 ? t.chosenCount.replace("{n}", String(count)) : rule}
                    </span>
                    {extra ? (
                      <Icon name="chevron" strokeWidth={2.6}
                        className={`size-9 text-(--color-ink-muted) transition-transform ${isOpen ? "rotate-90" : "rtl:-scale-x-100"}`} />
                    ) : null}
                  </span>
                </>
              );

              return (
                <div key={g.id} className="flex flex-col gap-4 border-t-2 border-(--color-line) pt-8">
                  {extra ? (
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                      className="flex min-h-20 items-center justify-between gap-4">
                      {heading}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-4">{heading}</div>
                  )}

                  {isOpen ? (
                    <div role={multi ? "group" : "radiogroup"} aria-label={g.name}
                      className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
                      {g.items.map((i) => {
                        const on = (picked[g.id] ?? []).includes(i.articleId);
                        return (
                          <button key={i.articleId} role={multi ? "checkbox" : "radio"} aria-checked={on}
                            onClick={() => toggle(g, i.articleId)} className={card(on)}>
                            {marker(on, multi)}
                            <span className="flex flex-col gap-1">
                              <span className="font-display text-3xl leading-tight font-bold">{i.name}</span>
                              {i.price > 0 ? (
                                <span className="text-2xl text-(--color-ink-muted) tabular-nums">+{money(i.price, currency, locale)}</span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-6 border-t-2 border-(--color-line) px-12 py-8">
          <div className="flex items-center gap-5" role="group" aria-label={t.quantity}>
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="−"
              className="flex size-24 items-center justify-center rounded-full border-2 border-slate-300 bg-(--color-page)">
              <Icon name="minus" className="size-10" strokeWidth={2.4} />
            </button>
            <span className="min-w-16 text-center font-display text-6xl font-bold tabular-nums">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="+"
              className="flex size-24 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
              <Icon name="plus" className="size-10" strokeWidth={2.4} />
            </button>
          </div>
          <button onClick={addToCart} disabled={!canAdd}
            className="min-h-28 max-w-2xl flex-1 rounded-full bg-(--color-brand) px-8 font-display text-4xl font-bold text-(--color-brand-ink) disabled:opacity-40">
            {t.add} · <span className="tabular-nums">{money(unitPrice * qty, currency, locale)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
