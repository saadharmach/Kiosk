"use client";

import { useState } from "react";
import { KIND_LABEL, STRINGS, money, type Locale } from "@/i18n";
import type { CatalogOptionGroup, CatalogProduct } from "@/lib/api";
import { isNewToday } from "@/lib/new-badge";
import { orderedSteps } from "@/lib/steps";
import { needsChoices } from "@/lib/suggestions";
import { isComplete, limits, preselected, previouslyPicked, toggled } from "@/lib/options";
import { useCart, type CartLine } from "@/state/cart";
import { Icon } from "./icons";

const SIZE = "size";
const SUGGEST = "suggest";

const CHIP_COLORS: [string, string][] = [
  ["#fde2e2", "#7f1d1d"], ["#fef3c7", "#78350f"], ["#dbeafe", "#1e3a8a"],
  ["#fde9d2", "#7c2d12"], ["#dcfce7", "#14532d"], ["#ede9fe", "#4c1d95"],
];

/** A suggestion's photo. A missing or broken one leaves a flat gap, so tiles stay aligned. */
function TilePhoto({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="h-40 w-full bg-(--color-surface-2)" />;
  // Decorative: the name below carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className="h-40 w-full object-cover" />;
}

/**
 * The product's choices, one step at a time: the size and the required groups first, then the optional extras,
 * then (for a new line) what the restaurant suggests with it. "Next" walks through them; a step after an unfinished
 * required one stays locked, and a step already passed can be tapped to change it.
 */
export default function ProductSheet({
  product, currency, locale, editing, suggestions = [], showImages = true, onAdded, onPickSuggestion, onClose,
}: {
  product: CatalogProduct;
  /** A cart line being changed: the sheet opens with its choices and saves over it. */
  editing?: CartLine;
  /** What to offer as the last step. Not used when editing. */
  suggestions?: CatalogProduct[];
  /** The restaurant can switch product photos off. */
  showImages?: boolean;
  /** Called after a new line has been added (not after an edit), with the names of everything added. */
  onAdded?: (names: string[]) => void;
  /** A suggestion with its own choices: the line is added, the sheet closes, and this opens that product. */
  onPickSuggestion?: (p: CatalogProduct) => void;
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
  // The suggestions ticked to go with this line (each one once).
  const offered = editing ? [] : suggestions;
  const [extras, setExtras] = useState<string[]>([]);
  const extraProducts = offered.filter((p) => extras.includes(p.id));
  const size = product.sizes.find((s) => s.sizeItemId === sizeId);
  const chosen = product.optionGroups.flatMap((g) =>
    g.items
      .filter((i) => (picked[g.id] ?? []).includes(i.articleId))
      .map((i) => ({ optionGroupId: g.id, articleId: i.articleId, name: i.name, price: i.price, kind: g.kind })),
  );
  const unitPrice =
    (size ? size.price : (product.price ?? 0)) + chosen.reduce((sum, o) => sum + o.price, 0);
  const total = unitPrice * qty + extraProducts.reduce((sum, p) => sum + (p.price ?? 0), 0);
  const groupsDone = product.optionGroups.every((g) => isComplete(g, picked[g.id] ?? []));
  const canAdd =
    unitPrice > 0 && (product.sizes.length === 0 || Boolean(size)) && groupsDone;

  // The steps on the left: the size (if any), the required groups, the optional ones, then the suggestions.
  const sections: { key: string; group: CatalogOptionGroup | null }[] = [
    ...(product.sizes.length > 0 ? [{ key: SIZE, group: null }] : []),
    ...orderedSteps(product.optionGroups).map((g) => ({ key: g.id, group: g })),
    ...(offered.length > 0 ? [{ key: SUGGEST, group: null }] : []),
  ];
  const [active, setActive] = useState<string | null>(sections[0]?.key ?? null);
  const activeIndex = Math.max(0, sections.findIndex((x) => x.key === active));
  const done = (key: string, picks = picked) => {
    if (key === SIZE) return Boolean(size);
    if (key === SUGGEST) return true;
    const g = product.optionGroups.find((x) => x.id === key);
    return !g || isComplete(g, picks[g.id] ?? []);
  };
  /** A step can be opened once every step before it is done. */
  const reachable = (index: number, picks = picked) => sections.slice(0, index).every((x) => done(x.key, picks));
  /** After a choice that settles a step: on to the next one. */
  const advanceFrom = (key: string, picks = picked) => {
    const i = sections.findIndex((x) => x.key === key);
    const next = sections[i + 1];
    if (next && reachable(i + 1, picks)) setActive(next.key);
  };

  const toggle = (g: CatalogOptionGroup, articleId: string) => {
    const nextPicks = { ...picked, [g.id]: toggled(g, picked[g.id] ?? [], articleId) };
    setPicked(nextPicks);
    const n = nextPicks[g.id].length;
    const { min, max } = limits(g);
    // A single choice, or a required "choose N" just completed, settles the step.
    if ((max === 1 && n === 1) || (min > 0 && n === max)) advanceFrom(g.id, nextPicks);
  };

  /** Adds the line (and the suggestions ticked with it). Returns false when something required is still missing. */
  const addToCart = (): boolean => {
    if (!canAdd) {
      // Show what is still missing instead of doing nothing.
      const missing = sections.find((x) => !done(x.key));
      if (missing) setActive(missing.key);
      return false;
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
    else {
      cart.add(line, qty);
      // The price here is only for the screen: the server prices every line again.
      for (const p of extraProducts) cart.add({ articleId: p.id, name: p.name, imageUrl: p.imageUrl, options: [], unitPrice: p.price ?? 0 });
      onAdded?.([product.name, ...extraProducts.map((p) => p.name)]);
    }
    onClose();
    return true;
  };

  const pickSuggestion = (p: CatalogProduct) => {
    if (needsChoices(p)) {
      if (addToCart()) onPickSuggestion?.(p);
      return;
    }
    setExtras((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id]));
  };

  const isLast = activeIndex >= sections.length - 1;
  // Editing a line: saving is open at any step, nobody walks through it all again.
  const showNext = !editing && !isLast;
  const stepDone = sections[activeIndex] ? done(sections[activeIndex].key) : true;
  const goNext = () => {
    const next = sections[activeIndex + 1];
    if (!next) return;
    if (!stepDone) return;
    setActive(next.key);
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
    if (key === SUGGEST) return extraProducts.length ? extraProducts.map((p) => p.name).join(", ") : t.optional;
    const g = product.optionGroups.find((x) => x.id === key)!;
    const names = g.items.filter((i) => (picked[g.id] ?? []).includes(i.articleId)).map((i) => i.name);
    return names.length ? names.join(", ") : rule(g);
  };
  const title = (key: string, group: CatalogOptionGroup | null) =>
    key === SIZE ? t.chooseSize : key === SUGGEST ? t.suggestionsStep : group!.name;

  const shown = sections[activeIndex] ?? null;
  const shownGroup = shown?.group ?? null;
  const stepLabel = sections.length > 1
    ? t.stepOf.replace("{n}", String(activeIndex + 1)).replace("{total}", String(sections.length))
    : null;
  const photoSlot = showImages && offered.some((p) => p.imageUrl);

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
          {isNewToday(product) ? (
            <span className="w-fit rounded-full bg-(--color-brand) px-5 py-1.5 font-display text-2xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
              {t.newItem}
            </span>
          ) : null}
          <h2 className="font-display text-7xl leading-[0.95] font-extrabold">{product.name}</h2>
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
          {/* The steps: tap one already reached to see its choices. */}
          <nav aria-label={product.name} className="flex w-[34%] max-w-md shrink-0 flex-col gap-3 overflow-y-auto border-e-2 border-(--color-line) bg-(--color-page) p-5">
            {sections.map((x, i) => {
              const on = i === activeIndex;
              const ok = done(x.key);
              const open = reachable(i);
              const chose = x.key === SIZE ? Boolean(size) : x.key === SUGGEST ? extras.length > 0 : (picked[x.key] ?? []).length > 0;
              const optional = x.key === SUGGEST || (x.group !== null && limits(x.group).min === 0);
              return (
                <button key={x.key} onClick={() => open && setActive(x.key)} disabled={!open} aria-current={on ? "step" : undefined}
                  className={`flex min-h-28 items-center gap-4 rounded-3xl border-[3px] px-5 py-4 text-start disabled:opacity-40 ${
                    on ? "border-(--color-brand) bg-(--color-surface) shadow-md" : "border-transparent"
                  }`}>
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-full font-display text-2xl font-extrabold ${
                    ok && chose ? "bg-(--color-success) text-white"
                      : on ? "bg-(--color-brand) text-(--color-brand-ink)"
                      : "bg-(--color-surface-2) text-(--color-ink-muted)"
                  }`}>
                    {ok && chose ? <Icon name="check" className="size-6" strokeWidth={3.5} /> : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-display text-3xl leading-tight font-bold">{title(x.key, x.group)}</span>
                    <span className={`line-clamp-2 text-xl ${
                      chose ? "font-semibold text-(--color-brand-deep)" : ok || optional ? "text-(--color-ink-muted)" : "font-semibold text-(--color-danger)"
                    }`}>
                      {summary(x.key)}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* The choices of the current step. */}
          <section key={active ?? ""} className="screen-in min-w-0 flex-1 overflow-y-auto p-8">
            {stepLabel ? (
              <p className="mb-2 text-2xl font-semibold tracking-wide text-(--color-ink-muted) uppercase">{stepLabel}</p>
            ) : null}
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
            ) : shown?.key === SUGGEST ? (
              <div className="flex flex-col gap-6">
                <span className="flex flex-col gap-1">
                  <span className="font-display text-4xl leading-tight font-bold">{t.suggestTitle}</span>
                  <span className="text-2xl text-(--color-ink-muted)">{t.suggestionsHint}</span>
                </span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-5">
                  {offered.map((p) => {
                    const on = extras.includes(p.id);
                    const later = needsChoices(p);
                    return (
                      <button key={p.id} onClick={() => pickSuggestion(p)} aria-pressed={later ? undefined : on}
                        className={`relative flex flex-col overflow-hidden rounded-[1.75rem] border-[3px] text-start ${
                          on ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-(--color-line) bg-(--color-page)"
                        }`}>
                        {photoSlot ? <TilePhoto src={p.imageUrl} /> : null}
                        {isNewToday(p) ? (
                          <span className="absolute start-3 top-3 rounded-full bg-(--color-brand) px-4 py-1 font-display text-xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase shadow">
                            {t.newItem}
                          </span>
                        ) : null}
                        <span className="flex flex-1 flex-col justify-between gap-3 p-4">
                          <span className="line-clamp-2 font-display text-3xl leading-tight font-bold break-words">{p.name}</span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-display text-3xl font-extrabold tabular-nums">
                              {p.sizes.length > 0
                                ? <><span className="me-1.5 text-xl font-bold">{t.fromPrice}</span>{money(Math.min(...p.sizes.map((s) => s.price)), currency, locale)}</>
                                : money(p.price ?? 0, currency, locale)}
                            </span>
                            {later ? (
                              <span className="flex h-14 items-center gap-1 rounded-full bg-(--color-brand) ps-5 pe-3 font-display text-2xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
                                {t.choose}
                                <Icon name="chevron" className="size-6 rtl:-scale-x-100" strokeWidth={3} />
                              </span>
                            ) : on ? (
                              <span className="flex size-14 items-center justify-center rounded-full bg-(--color-success) text-white">
                                <Icon name="check" className="size-7" strokeWidth={3.2} />
                              </span>
                            ) : (
                              <span className="flex size-14 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                                <Icon name="plus" className="size-7" strokeWidth={2.8} />
                              </span>
                            )}
                          </span>
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

      <footer className="flex shrink-0 items-center justify-between gap-6 rounded-t-[2.5rem] bg-(--color-surface) px-10 py-7 shadow-[0_-16px_40px_rgba(36,33,31,0.12)]">
        <div className="flex items-center gap-5" role="group" aria-label={t.quantity}>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="−"
            className="flex size-24 items-center justify-center rounded-full border-2 border-(--color-line) bg-(--color-page)">
            <Icon name="minus" className="size-10" strokeWidth={2.4} />
          </button>
          <span className="min-w-16 text-center font-display text-7xl font-extrabold tabular-nums">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="+"
            className="flex size-24 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
            <Icon name="plus" className="size-10" strokeWidth={2.4} />
          </button>
        </div>
        {showNext ? (
          // Not disabled: until the step is done, a tap simply stays on it.
          <button onClick={goNext} aria-disabled={!stepDone}
            className={`flex min-h-28 max-w-2xl flex-1 items-center justify-center gap-4 rounded-full px-8 font-display text-5xl font-extrabold tracking-wide uppercase ${
              stepDone ? "bg-(--color-brand) text-(--color-brand-ink)" : "bg-(--color-line) text-(--color-ink-muted)"
            }`}>
            <span>{t.nextStep} · <span className="tabular-nums">{money(total, currency, locale)}</span></span>
            <Icon name="chevron" className="size-10 rtl:-scale-x-100" strokeWidth={3} />
          </button>
        ) : (
          // Not disabled: when something is missing, a tap shows it on the left.
          <button onClick={addToCart} aria-disabled={!canAdd}
            className={`min-h-28 max-w-2xl flex-1 rounded-full px-8 font-display text-5xl font-extrabold tracking-wide uppercase ${canAdd ? "bg-(--color-brand) text-(--color-brand-ink)" : "bg-(--color-line) text-(--color-ink-muted)"}`}>
            {editing ? t.saveChanges : t.add} · <span className="tabular-nums">{money(total, currency, locale)}</span>
          </button>
        )}
      </footer>
    </div>
  );
}
