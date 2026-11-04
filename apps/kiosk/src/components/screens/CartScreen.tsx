"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABEL, STRINGS, money, type Locale } from "@/i18n";
import { KIND_ORDER } from "@/lib/options";
import {
  ApiError, cancelPayment, createOrder, getOrder, isConnectionError, isNotRegisteredError, isTillError, isUnavailableError, payOrder, priceCart, simulatePayment,
  type CatalogProduct, type PaymentOptions, type PlacedOrder, type WireCartLine,
} from "@/lib/api";
import { useCart, type CartLine } from "@/state/cart";
import KioskHeader from "../KioskHeader";
import { Icon } from "../icons";
import ProductSheet from "../ProductSheet";
import PaymentPanel from "../PaymentPanel";
import { newId } from "../../lib/uuid";
import { isNewToday } from "@/lib/new-badge";
import { needsChoices, pickBasketSuggestions } from "@/lib/suggestions";

/** Cart thumbnail that quietly disappears if the image cannot be loaded. */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // Decorative: the name beside it carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className="size-36 shrink-0 rounded-3xl object-cover" />;
}

/** A suggestion's photo. A missing or broken one leaves a flat gap, so tiles stay aligned. */
function TilePhoto({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="size-36 shrink-0 bg-(--color-surface-2)" />;
  // Decorative: the name beside it carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setFailed(true)} className="size-36 shrink-0 object-cover" />;
}

/** A server that does not say (older): cash, paid at the counter, as before. */
const CASH_ONLY: PaymentOptions = { card: false, cash: true, cashClosed: false, simulator: false };

export default function CartScreen({
  slug, locale, name, currency, products, suggestions = {}, basketSuggestions, showImages = true, orderType, salesAreaId, tableNumber, borneCode, onLocale, onBack, onPlaced, onUnavailable,
  payment = CASH_ONLY, onPaying,
}: {
  slug: string;
  locale: Locale;
  name: string;
  onLocale: (l: Locale) => void;
  currency: string;
  /** The menu, so a line can be reopened in its product sheet. */
  products: CatalogProduct[];
  /** Per department, then the basket's own list: what the "You might also like" row offers. */
  suggestions?: Record<string, string[]>;
  basketSuggestions?: string[];
  /** The restaurant can switch product photos off. */
  showImages?: boolean;
  orderType: string;
  salesAreaId: string;
  tableNumber: number | null;
  /** Which borne this is, so the ticket prints on its own printer. */
  borneCode?: string;
  onBack: () => void;
  onPlaced: (order: PlacedOrder) => void;
  /** The restaurant was switched off while the customer was ordering: the cart is kept, the kiosk shows its calm screen. */
  /** The restaurant stopped taking orders, or its till does not answer: the kiosk shows the matching screen. */
  onUnavailable: (e: ApiError) => void;
  /** The ways to pay this borne offers (the Règlement screen). */
  payment?: PaymentOptions;
  /** True while the borne's TPE is working: the kiosk must not reset itself for inactivity then. */
  onPaying?: (paying: boolean) => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ line: CartLine; product: CatalogProduct } | null>(null);
  // A suggestion with a size or a required choice opens its sheet here; any other is added at a tap.
  const [adding, setAdding] = useState<CatalogProduct | null>(null);
  const offered = useMemo(
    () => pickBasketSuggestions({ products, suggestions, basketSuggestions }, cart.lines.map((l) => l.articleId)),
    [products, suggestions, basketSuggestions, cart.lines],
  );
  const photoSlot = showImages && offered.some((p) => p.imageUrl);
  const takeSuggestion = (p: CatalogProduct) => {
    if (needsChoices(p)) return setAdding(p);
    // The price here is only for the screen: the server prices the basket again at once.
    cart.add({ articleId: p.id, name: p.name, imageUrl: p.imageUrl, options: [], unitPrice: p.price ?? 0 });
  };

  /** Only a dish with something to choose can be edited, and only if it is still on the menu. */
  const productFor = (l: CartLine) => {
    const p = products.find((x) => x.id === l.articleId);
    return p && (p.sizes.length > 0 || p.optionGroups.length > 0) ? p : null;
  };

  // One id for this cart. Reused on every retry so a repeated tap or a dropped
  // response can never produce two orders.
  const clientOrderId = useRef<string>(newId());

  // The Règlement screen over the cart, then the TPE screen for a card. Once a card order exists (waiting for its
  // payment), choosing again pays that same order instead of creating another one.
  const [stage, setStage] = useState<"cart" | "choose" | "card">("cart");
  const [problem, setProblem] = useState<string | null>(null);
  const orderWaiting = useRef(false);
  useEffect(() => { onPaying?.(stage === "card"); }, [stage, onPaying]);
  useEffect(() => () => onPaying?.(false), [onPaying]);

  /** Where an answer from the server leads: paid or cash → the ticket; a card still to pay → the TPE screen. */
  const follow = (order: PlacedOrder) => {
    if (order.status !== "AWAITING_PAYMENT") { setStage("cart"); onPlaced(order); return; }
    orderWaiting.current = true;
    const attempt = order.payment?.attempt;
    // PENDING: the TPE is working. APPROVED while the order still waits: the server is moving it on this very moment
    // (two steps), so keep waiting on the terminal screen; the next look finds it paid.
    if (attempt?.status === "PENDING" || attempt?.status === "APPROVED") { setProblem(null); setStage("card"); return; }
    // Refused or failed: the Règlement screen says so (nothing is validated). Stopped by the customer: just the choice again.
    setProblem(attempt?.status === "DECLINED" || attempt?.status === "FAILED" ? attempt.message ?? "" : null);
    setStage("choose");
  };

  // While the TPE works, look at the order every moment and a half: approved, declined, failed.
  useEffect(() => {
    if (stage !== "card") return;
    const id = window.setInterval(() => {
      getOrder(slug, clientOrderId.current).then(follow, () => undefined);
    }, 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, slug]);

  const handle = (e: unknown) => {
    const err = e as ApiError;
    if (isUnavailableError(err) || isTillError(err) || isNotRegisteredError(err)) return onUnavailable(err);
    setError(err.code === "PRICES_CHANGED" ? t.priceChanged : isConnectionError(err) ? t.connectionInline : err.message);
    setStage("cart");
    if (err.code === "PRICES_CHANGED") {
      priceCart(slug, { orderType, salesAreaId, locale, lines: wire() }).then((p) => setServerTotal(p.total)).catch(() => undefined);
    }
  };

  const pick = async (method: "CARD" | "CASH") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      follow(orderWaiting.current ? await payOrder(slug, clientOrderId.current, method) : await place(method));
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  const stopCard = async () => {
    setBusy(true);
    try { follow(await cancelPayment(slug, clientOrderId.current)); } catch (e) { handle(e); } finally { setBusy(false); }
    setProblem(null);
  };

  /** Back to the cart from the Règlement screen: an order waiting for a card is left behind, edits make a new one. */
  const backToCart = () => {
    if (orderWaiting.current) {
      void cancelPayment(slug, clientOrderId.current).catch(() => undefined);
      clientOrderId.current = newId();
      orderWaiting.current = false;
    }
    setProblem(null);
    setStage("cart");
  };

  const wire = (): WireCartLine[] =>
    cart.lines.map((l) => ({
      articleId: l.articleId,
      quantity: l.quantity,
      ...(l.sizeItemId ? { sizeItemId: l.sizeItemId } : {}),
      ...(l.options.length
        ? { options: l.options.map((o) => ({ optionGroupId: o.optionGroupId, articleId: o.articleId })) }
        : {}),
    }));

  // Re-price on the server whenever the cart changes: the displayed total must
  // be the server's number, not ours.
  useEffect(() => {
    if (cart.lines.length === 0) { setServerTotal(null); return; }
    let cancelled = false;
    setError(null);
    priceCart(slug, { orderType, salesAreaId, locale, lines: wire() }).then(
      (p) => !cancelled && setServerTotal(p.total),
      (e) => {
        if (cancelled) return;
        if (isUnavailableError(e) || isTillError(e) || isNotRegisteredError(e)) return onUnavailable(e);
        setError(isConnectionError(e) ? t.connectionInline : e.message);
      },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, orderType, salesAreaId, cart.lines]);

  /** The order itself, created once (its id makes a repeated tap harmless), paid as chosen. */
  const place = (method: "CARD" | "CASH") => createOrder(slug, {
        clientOrderId: clientOrderId.current,
        orderType,
        salesAreaId,
        locale,
        ...(tableNumber !== null ? { tableNumber } : {}),
        ...(borneCode ? { borneCode } : {}),
        displayedTotalCents: Math.round((serverTotal ?? 0) * 100),
        payment: method,
        lines: wire(),
      });

  /** The Règlement screen: the total, and how to pay (also when cash is the only way, so it is the same everywhere). */
  const confirm = () => {
    if (serverTotal === null || busy) return;
    setStage("choose");
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <KioskHeader name={name} locale={locale} onLocale={onLocale} onBack={onBack} backLabel={t.back} />

      {cart.lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-16 text-center">
          <span className="flex size-60 items-center justify-center rounded-full bg-(--color-line) text-(--color-ink-muted)">
            <Icon name="bag" className="size-28" strokeWidth={1.4} />
          </span>
          <h1 className="font-display text-8xl leading-[0.95] font-extrabold">{t.empty}</h1>
          <button onClick={onBack}
            className="mt-6 flex min-h-30 items-center gap-4 rounded-full bg-(--color-brand) px-16 font-display text-5xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
            {t.seeMenu}
            <Icon name="chevron" className="size-9 rtl:-scale-x-100" strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-12 pt-12 pb-72">
            <h1 className="mb-8 font-display text-8xl leading-none font-extrabold">{t.yourOrder}</h1>
            <ul className="flex flex-col gap-5">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex items-center gap-6 rounded-4xl bg-(--color-surface) p-6 shadow-md">
                  {l.imageUrl ? <Thumb src={l.imageUrl} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-5xl leading-tight font-bold">{l.name}</p>
                    {l.sizeName ? <p className="mt-1 text-2xl text-(--color-ink-muted)">{l.sizeName}</p> : null}
                    {/* Each kind of option on its own line, under unTill's name for it */}
                    {KIND_ORDER.map((kind) => {
                      const names = l.options.filter((o) => o.kind === kind).map((o) => o.name);
                      return names.length > 0 ? (
                        <p key={kind} className="mt-1 text-2xl text-(--color-ink-muted)">
                          <span className="font-semibold">{KIND_LABEL(kind, t)}:</span> {names.join(", ")}
                        </p>
                      ) : null;
                    })}
                    <p className="mt-3 font-display text-5xl font-extrabold tabular-nums">
                      {money(l.unitPrice * l.quantity, currency, locale)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {productFor(l) ? (
                      <button onClick={() => setEditing({ line: l, product: productFor(l)! })} aria-label={t.edit}
                        className="flex size-20 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-deep)">
                        <Icon name="edit" className="size-9" />
                      </button>
                    ) : null}
                    <button onClick={() => cart.setQty(l.key, l.quantity - 1)} aria-label="−"
                      className="flex size-20 items-center justify-center rounded-full border-2 border-(--color-line) bg-(--color-page)">
                      <Icon name="minus" className="size-8" strokeWidth={2.4} />
                    </button>
                    <span className="min-w-12 text-center font-display text-5xl font-bold tabular-nums">{l.quantity}</span>
                    <button onClick={() => cart.setQty(l.key, l.quantity + 1)} aria-label="+"
                      className="flex size-20 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                      <Icon name="plus" className="size-8" strokeWidth={2.4} />
                    </button>
                    <button onClick={() => cart.remove(l.key)} aria-label={t.remove}
                      className="ms-2 flex size-20 items-center justify-center rounded-full bg-(--color-danger-soft) text-(--color-danger)">
                      <Icon name="trash" className="size-9" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {offered.length > 0 ? (
              <section aria-label={t.alsoLike} className="mt-10 flex flex-col gap-4">
                <h2 className="font-display text-5xl leading-tight font-extrabold">{t.alsoLike}</h2>
                <ul className="-mx-12 flex gap-4 overflow-x-auto px-12 pb-2">
                  {offered.map((p) => (
                    <li key={p.id} className="shrink-0">
                      <button onClick={() => takeSuggestion(p)}
                        className="relative flex h-36 w-[26rem] overflow-hidden rounded-[1.75rem] bg-(--color-surface) text-start shadow-md">
                        {photoSlot ? <TilePhoto src={p.imageUrl} /> : null}
                        <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 p-4">
                          <span className="flex flex-col gap-1">
                            {isNewToday(p) ? (
                              <span className="w-fit rounded-full bg-(--color-brand) px-3 py-0.5 font-display text-lg font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
                                {t.newItem}
                              </span>
                            ) : null}
                            <span className="line-clamp-2 font-display text-3xl leading-tight font-bold break-words">{p.name}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-display text-3xl font-extrabold tabular-nums">
                              {p.sizes.length > 0
                                ? <><span className="me-1.5 text-xl font-bold">{t.fromPrice}</span>{money(Math.min(...p.sizes.map((s) => s.price)), currency, locale)}</>
                                : money(p.price ?? 0, currency, locale)}
                            </span>
                            {needsChoices(p) ? (
                              <span className="flex h-14 items-center gap-1 rounded-full bg-(--color-brand) ps-5 pe-3 font-display text-2xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase">
                                {t.choose}
                                <Icon name="chevron" className="size-6 rtl:-scale-x-100" strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-(--color-brand-ink)">
                                <Icon name="plus" className="size-7" strokeWidth={2.8} />
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-10 flex items-baseline justify-between border-t-2 border-(--color-line) px-3 pt-8">
              <span className="font-display text-6xl font-extrabold">{t.total}</span>
              <span className="font-display text-8xl font-extrabold tabular-nums">
                {serverTotal === null ? "…" : money(serverTotal, currency, locale)}
              </span>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-[2.5rem] bg-(--color-surface) px-12 pt-8 pb-10 shadow-[0_-16px_40px_rgba(36,33,31,0.12)]">
            {error ? <p role="alert" className="text-center text-2xl font-semibold text-(--color-danger)">{error}</p> : null}
            <div className="flex gap-5">
              <button onClick={onBack}
                className="min-h-30 flex-1 rounded-full border-2 border-(--color-line) bg-(--color-surface) font-display text-4xl font-extrabold tracking-wide uppercase">
                {t.addMore}
              </button>
              <button onClick={confirm} disabled={busy || serverTotal === null}
                className="flex min-h-30 flex-[1.3] items-center justify-center gap-4 rounded-full bg-(--color-brand) font-display text-5xl font-extrabold tracking-wide text-(--color-brand-ink) uppercase disabled:bg-(--color-line) disabled:text-(--color-ink-muted)">
                {busy ? t.sending : t.toPayment}
                <Icon name="chevron" className="size-10 rtl:-scale-x-100" strokeWidth={3} />
              </button>
            </div>
          </div>
        </>
      )}

      {editing ? (
        <ProductSheet product={editing.product} editing={editing.line} currency={currency} locale={locale}
          onClose={() => setEditing(null)} />
      ) : null}

      {adding ? (
        <ProductSheet key={adding.id} product={adding} currency={currency} locale={locale} showImages={showImages}
          onClose={() => setAdding(null)} />
      ) : null}

      {stage !== "cart" && serverTotal !== null ? (
        <PaymentPanel stage={stage} options={payment} total={serverTotal} currency={currency} locale={locale} busy={busy} problem={problem}
          onPick={(m) => void pick(m)} onCancelCard={() => void stopCard()} onBack={backToCart}
          onSimulate={payment.simulator ? (approve) => { void simulatePayment(slug, clientOrderId.current, approve).then(follow, () => undefined); } : undefined} />
      ) : null}
    </main>
  );
}
