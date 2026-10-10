"use client";

import { useState } from "react";
import { KIND_LABEL, STRINGS, money, type Locale } from "@/i18n";
import type { CatalogOptionGroup, CatalogProduct } from "@/lib/api";
import { isComplete, limits, preselected, previouslyPicked, toggled } from "@/lib/options";
import { useCart, type CartLine } from "@/state/cart";
import { Icon } from "./icons";

const SIZE = "size";

const CHIP_COLORS: [string, string][] = [
  ["#fde2e2", "#7f1d1d"], ["#fef3c7", "#78350f"], ["#dbeafe", "#1e3a8a"],
  ["#fde9d2", "#7c2d12"], ["#dcfce7", "#14532d"], ["#ede9fe", "#4c1d95"],
];

export default function ProductSheet({
  product, currency, locale, editing, onAdded, onClose,
}: {
  product: CatalogProduct;
  /** A cart line being changed: the sheet opens with its choices and saves over it. */
  editing?: CartLine;
  /** Called after a new line has been added (not after an edit). */
  onAdded?: () => void;
  currency: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const [sizeId, setSizeId] = useState<string | null>(() => {
    const was = editing?.sizeItemId;
    return was && product.sizes.some((s) => s.sizeItemId === was) ? was : (product.sizes[0]?.sizeItemId ?? null);
  });
  const [qty, setQty] = useState(editing?.quantity ?? 1);
  const [imageFailed, setImageFailed] = useState(false);
  const photo = product.imageUrl && !imageFailed ? product.imageUrl : null;
  // groupId -> chosen option article ids. A required group with one item is pre-chosen.
  const [picked, setPicked] = useState<Record<string, string[]>>(() => ({
    ...preselected(product.optionGroups),
    ...(editing ? previouslyPicked(product.optionGroups, editing) : {}),
  }));
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

  // The titles on the left: the size (if any), then each option group. One is shown at a time on the right.
  const sections: { key: string; group: CatalogOptionGroup | null }[] = [
    ...(product.sizes.length > 0 ? [{ key: SIZE, group: null }] : []),
    ...product.optionGroups.map((g) => ({ key: g.id, group: g })),
  ];
  const [active, setActive] = useState<string | null>(sections[0]?.key ?? null);
  const done = (key: string, picks = picked) => {
    if (key === SIZE) return Boolean(size);
    const g = product.optionGroups.find((x) => x.id === key);
    return !g || isComplete(g, picks[g.id] ?? []);
  };
  /** After a single choice, go on to the next title that still needs one (stay if none does). */
  const advanceFrom = (key: string, picks = picked) => {
    const next = sections.slice(sections.findIndex((x) => x.key === key) + 1).find((x) => !done(x.key, picks));
    if (next) setActive(next.key);
  };

  const toggle = (g: CatalogOptionGroup, articleId: string) => {
    const nextPicks = { ...picked, [g.id]: toggled(g, picked[g.id] ?? [], articleId) };
    setPicked(nextPicks);
    if (limits(g).max === 1 && nextPicks[g.id].length === 1) advanceFrom(g.id, nextPicks);
  };

  const addToCart = () => {
    if (!canAdd) {
      // Show what is still missing instead of doing nothing.
      const missing = sections.find((x) => !done(x.key));
      if (missing) setActive(missing.key);
      return;
    }
    const line = {
      articleId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      sizeItemId: size?.sizeItemId,
      sizeName: size?.name,
      options: chosen,
      unitPrice,
    };
    if (editing) cart.replace(editing.key, line, qty);
    else { cart.add(line, qty); onAdded?.(); }
    onClose();
  };

  /** A radio circle for single picks, a square tick for "choose N". */
  const marker = (on: boolean, square: boolean) => (
    <span className={`flex size-10 shrink-0 items-center justify-center border-[3px] bg-white ${square ? "rounded-lg" : "rounded-full"} ${
      on ? "border-(--color-brand-deep)" : "border-(--color-ink-muted)"
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
      on ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-(--color-line) bg-(--color-page)"
    }`;

  /** What a group asks for: "Choose 2", "Required" or "Optional". */
  const rule = (g: CatalogOptionGroup) =>
    g.requiredChoices !== null ? t.chooseCount.replace("{n}", String(g.requiredChoices)) : limits(g).min > 0 ? t.required : t.optional;
  /** What the left column says under a title: the choice made, or what is asked. */
  const summary = (key: string) => {
    if (key === SIZE) return size ? `${size.name} · ${money(size.price, currency, locale)}` : t.required;
    const g = product.optionGroups.find((x) => x.id === key)!;
    const names = g.items.filter((i) => (picked[g.id] ?? []).includes(i.articleId)).map((i) => i.name);
    return names.length ? names.join(", ") : rule(g);
  };

  const shown = sections.find((x) => x.key === active) ?? null;
  const shownGroup = shown?.group ?? null;

  const allergens = product.allergens.length > 0 ? (
    // The server sends an empty list when the restaurant switches allergens off.
    <div className="flex flex-wrap items-center gap-3" aria-label={t.allergens}>
      {product.allergens.map((a) => {
        const [bg, fg] = CHIP_COLORS[a.number % CHIP_COLORS.length];
        return (
          <span key={a.id} style={{ background: bg, color: fg }}
            className="flex h-12 items-center gap-2 rounded-full ps-1.5 pe-5 text-xl font-semibold">
            <span className="flex size-9 items-center justify-center rounded-full bg-white font-display text-lg font-bold">
              {Array.from(a.name)[0]?.toUpperCase()}
            </span>
            {a.name}
          </span>
        );
      })}
    </div>
  ) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label={product.name} className="fixed inset-0 z-50 flex flex-col bg-(--color-surface)">
      {/* The product: photo, name, description, allergens. */}
      <header className="flex shrink-0 items-start gap-8 border-b-2 border-(--color-line) px-10 py-8">
        {photo && sections.length > 0 ? (
          // Decorative: the name beside it carries the meaning, so alt stays empty.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-44 shrink-0 rounded-3xl object-cover" onError={() => setImageFailed(true)} />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="font-display text-6xl leading-tight font-bold">{product.name}</h2>
          {product.description ? <p className="text-3xl leading-snug text-(--color-ink-muted)">{product.description}</p> : null}
          {allergens}
        </div>
        <button onClick={onClose} aria-label={t.close}
          className="flex size-22 shrink-0 items-center justify-center rounded-full bg-(--color-page) text-(--color-ink)">
          <Icon name="close" className="size-10" strokeWidth={2.4} />
        </button>
      </header>

      {sections.length === 0 ? (
        // Nothing to choose: the photo, big.
        <div className="flex min-h-0 flex-1 items-center justify-center p-10">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="max-h-full max-w-full rounded-[3rem] object-contain" onError={() => setImageFailed(true)} />
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* The titles: tap one to see its choices. */}
          <nav aria-label={product.name} className="flex w-[34%] max-w-md shrink-0 flex-col gap-3 overflow-y-auto border-e-2 border-(--color-line) bg-(--color-page) p-5">
            {sections.map((x) => {
              const on = x.key === active;
              const ok = done(x.key);
              const chose = x.key === SIZE ? Boolean(size) : (picked[x.key] ?? []).length > 0;
              return (
                <button key={x.key} onClick={() => setActive(x.key)} aria-current={on ? "step" : undefined}
                  className={`flex min-h-28 items-center gap-4 rounded-3xl border-[3px] px-5 py-4 text-start ${
                    on ? "border-(--color-brand) bg-(--color-surface) shadow-md" : "border-transparent"
                  }`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-display text-3xl leading-tight font-bold">{x.key === SIZE ? t.chooseSize : x.group!.name}</span>
                    <span className={`line-clamp-2 text-xl ${chose ? "font-semibold text-(--color-brand-deep)" : ok ? "text-(--color-ink-muted)" : "font-semibold text-(--color-danger)"}`}>
                      {summary(x.key)}
                    </span>
                  </span>
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${ok && chose ? "bg-(--color-brand) text-(--color-brand-ink)" : ""}`}>
                    {ok && chose ? <Icon name="check" className="size-6" strokeWidth={3.5} />
                      : <Icon name="chevron" strokeWidth={2.6} className="size-8 text-(--color-ink-muted) rtl:-scale-x-100" />}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* The choices of the title picked on the left. */}
          <section key={active ?? ""} className="min-w-0 flex-1 overflow-y-auto p-8">
            {shown?.key === SIZE ? (
              <div className="flex flex-col gap-6">
              <p className="font-display text-4xl leading-tight font-bold">{t.chooseSize}</p>
              <div role="radiogroup" aria-label={t.chooseSize} className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                {product.sizes.map((s) => {
                  const on = s.sizeItemId === sizeId;
                  return (
                    <button key={s.sizeItemId} role="radio" aria-checked={on}
                      onClick={() => { setSizeId(s.sizeItemId); advanceFrom(SIZE); }} className={card(on)}>
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
            ) : shownGroup ? (() => {
              const g = shownGroup;
              const multi = limits(g).max > 1;
              return (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-display text-4xl leading-tight font-bold">{g.name}</span>
                      {/* unTill's own name for what kind of option this is */}
                      <span className="text-2xl font-semibold tracking-wide text-(--color-ink-muted)">{KIND_LABEL(g.kind, t)}</span>
                    </span>
                    <span className="rounded-full bg-(--color-brand-soft) px-5 py-2 text-2xl font-bold text-(--color-brand-deep)">
                      {multi && (picked[g.id] ?? []).length > 0 ? t.chosenCount.replace("{n}", String((picked[g.id] ?? []).length)) : rule(g)}
                    </span>
                  </div>
                  <div role={multi ? "group" : "radiogroup"} aria-label={g.name}
                    className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
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
                </div>
              );
            })() : null}
          </section>
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-6 border-t-2 border-(--color-line) px-10 py-7">
        <div className="flex items-center gap-5" role="group" aria-label={t.quantity}>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="−"
            className="flex size-24 items-center justify-center rounded-full border-2 border-(--color-line) bg-(--color-page)">
            <Icon name="minus" className="size-10" strokeWidth={2.4} />
          </button>
          <span className="min-w-16 text-center font-display text-6xl font-bold tabular-nums">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="+"
            className="flex size-24 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
            <Icon name="plus" className="size-10" strokeWidth={2.4} />
          </button>
        </div>
        {/* Not disabled: when something is missing, a tap shows it on the left. */}
        <button onClick={addToCart} aria-disabled={!canAdd}
          className={`min-h-28 max-w-2xl flex-1 rounded-full bg-(--color-brand) px-8 font-display text-4xl font-bold text-(--color-brand-ink) ${canAdd ? "" : "opacity-40"}`}>
          {editing ? t.saveChanges : t.add} · <span className="tabular-nums">{money(unitPrice * qty, currency, locale)}</span>
        </button>
      </footer>
    </div>
  );
}
