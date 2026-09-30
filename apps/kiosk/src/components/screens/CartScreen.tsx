"use client";

import { useEffect, useRef, useState } from "react";
import { STRINGS, money, type Locale } from "@/i18n";
import { ApiError, createOrder, priceCart, type PlacedOrder, type WireCartLine } from "@/lib/api";
import { useCart } from "@/state/cart";

export default function CartScreen({
  slug, locale, currency, orderType, salesAreaId, tableNumber, onBack, onPlaced,
}: {
  slug: string;
  locale: Locale;
  currency: string;
  orderType: string;
  salesAreaId: string;
  tableNumber: number | null;
  onBack: () => void;
  onPlaced: (order: PlacedOrder) => void;
}) {
  const t = STRINGS[locale];
  const cart = useCart();
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One id for this cart. Reused on every retry so a repeated tap or a dropped
  // response can never produce two orders.
  const clientOrderId = useRef<string>(crypto.randomUUID());

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
    priceCart(slug, { orderType, salesAreaId, lines: wire() }).then(
      (p) => !cancelled && setServerTotal(p.total),
      (e) => !cancelled && setError(e.message),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, orderType, salesAreaId, cart.lines]);

  const confirm = async () => {
    if (serverTotal === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder(slug, {
        clientOrderId: clientOrderId.current,
        orderType,
        salesAreaId,
        ...(tableNumber !== null ? { tableNumber } : {}),
        displayedTotalCents: Math.round(serverTotal * 100),
        lines: wire(),
      });
      onPlaced(order);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "PRICES_CHANGED" ? t.priceChanged : err.message);
      // A price change invalidates what the customer agreed to, so re-price.
      if (err.code === "PRICES_CHANGED") {
        priceCart(slug, { orderType, salesAreaId, lines: wire() })
          .then((p) => setServerTotal(p.total))
          .catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-(--color-line) p-6">
        <button onClick={onBack} className="min-h-16 rounded-(--radius-card) px-6 text-xl text-(--color-ink-muted)">
          {t.back}
        </button>
        <h1 className="text-3xl font-semibold">{t.yourOrder}</h1>
        <span className="w-24" />
      </header>

      <div className="flex-1 overflow-y-auto p-5 pb-56">
        {cart.lines.length === 0 ? (
          <p className="mt-20 text-center text-2xl text-(--color-ink-muted)">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {cart.lines.map((l) => (
              <li key={l.key} className="rounded-(--radius-card) bg-(--color-surface-2) p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-2xl font-medium">{l.name}</p>
                    {l.sizeName ? <p className="text-xl text-(--color-ink-muted)">{l.sizeName}</p> : null}
                    {l.options.length > 0 ? (
                      <p className="text-xl text-(--color-ink-muted)">{l.options.map((o) => o.name).join(", ")}</p>
                    ) : null}
                  </div>
                  <p className="text-2xl tabular-nums">{money(l.unitPrice * l.quantity, currency, locale)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => cart.setQty(l.key, l.quantity - 1)}
                      className="size-16 rounded-full bg-(--color-surface) text-3xl">−</button>
                    <span className="min-w-12 text-center text-3xl tabular-nums">{l.quantity}</span>
                    <button onClick={() => cart.setQty(l.key, l.quantity + 1)}
                      className="size-16 rounded-full bg-(--color-surface) text-3xl">+</button>
                  </div>
                  <button onClick={() => cart.remove(l.key)}
                    className="min-h-16 px-4 text-xl text-(--color-danger)">{t.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cart.lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 flex flex-col gap-3 border-t border-(--color-line) bg-(--color-surface) p-5">
          {error ? <p className="text-center text-xl text-(--color-danger)">{error}</p> : null}
          <button onClick={confirm} disabled={busy || serverTotal === null}
            className="flex min-h-28 w-full items-center justify-between rounded-(--radius-card) bg-(--color-brand) px-8 text-3xl font-medium text-(--color-brand-ink) disabled:opacity-40">
            <span>{busy ? t.sending : t.confirmOrder}</span>
            <span className="tabular-nums">
              {serverTotal === null ? "…" : money(serverTotal, currency, locale)}
            </span>
          </button>
        </div>
      ) : null}
    </main>
  );
}