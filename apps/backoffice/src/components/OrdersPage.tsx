"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ORDER_STATUSES, cancelOrder, getOrder, listOrders, money, retryOrder,
  submitOrder, verifyOrder, when,
  type OrderDetail, type OrderPage, type OrderRow,
} from "@/lib/orders";

const field = "h-10 rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3";
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const lbl = "mb-1 block text-sm text-(--color-ink-muted)";

/** Only FAILED and CANCELLED get colour. Everything else is normal progress. */
function statusClass(s: string): string {
  if (s === "FAILED") return "text-(--color-danger)";
  if (s === "CANCELLED") return "text-(--color-ink-muted) line-through";
  if (s === "CONFIRMED" || s === "PAID") return "font-medium";
  return "text-(--color-ink-muted)";
}

export default function OrdersPage({ slug }: { slug: string }) {
  const [data, setData] = useState<OrderPage | null>(null);
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await listOrders(slug, {
        status, reference, from, to, page: String(page), pageSize: "25",
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, status, reference, from, to, page]);

  // Debounced so typing a reference doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  // Orders arrive while someone is looking at this screen.
  useEffect(() => {
    if (openId) return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load, openId]);

  if (openId) {
    return (
      <OrderDetailView
        slug={slug}
        id={openId}
        onBack={() => { setOpenId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className={lbl} htmlFor="o-status">Status</label>
          <select id="o-status" className={field} value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="min-w-48 flex-1">
          <label className={lbl} htmlFor="o-ref">Reference</label>
          <input id="o-ref" className={`${field} w-full`} value={reference}
            placeholder="K0-0929"
            onChange={(e) => { setPage(1); setReference(e.target.value); }} />
        </div>

        <div>
          <label className={lbl} htmlFor="o-from">From</label>
          <input id="o-from" type="date" className={field} value={from}
            onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        </div>

        <div>
          <label className={lbl} htmlFor="o-to">To</label>
          <input id="o-to" type="date" className={field} value={to}
            onChange={(e) => { setPage(1); setTo(e.target.value); }} />
        </div>

        <button type="button" onClick={load}
          className="h-10 rounded-lg border border-(--color-line) px-4">
          Refresh
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-(--color-danger)">{error}</p> : null}

      {!data ? (
        <p className="text-(--color-ink-muted)">Loading…</p>
      ) : data.orders.length === 0 ? (
        <div className={card}>
          <p className="text-(--color-ink-muted)">
            No orders match these filters. Clear the dates or the reference to see everything.
          </p>
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-start text-(--color-ink-muted)">
              <tr className="border-b border-(--color-line)">
                <th className="py-2 text-start font-normal">Reference</th>
                <th className="py-2 text-start font-normal">Status</th>
                <th className="py-2 text-start font-normal">Type</th>
                <th className="py-2 text-end font-normal">Table</th>
                <th className="py-2 text-end font-normal">Items</th>
                <th className="py-2 text-end font-normal">Total</th>
                <th className="py-2 text-start font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o: OrderRow) => (
                <tr key={o.id}
                  onClick={() => setOpenId(o.id)}
                  className="cursor-pointer border-b border-(--color-line) hover:bg-(--color-surface-2)">
                  <td className="py-2 font-mono">{o.reference}</td>
                  <td className={`py-2 ${statusClass(o.status)}`}>
                    {o.status}
                    {o.tpapiLastError ? (
                      <span className="ms-2 text-xs text-(--color-ink-muted)">
                        {o.tpapiLastError.slice(0, 40)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">{o.orderType}</td>
                  <td className="py-2 text-end">{o.tableNumber ?? "—"}</td>
                  <td className="py-2 text-end">{o.itemCount}</td>
                  <td className="py-2 text-end">{money(o.total, o.currency)}</td>
                  <td className="py-2">{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-3 text-sm text-(--color-ink-muted)">
            <button type="button" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 rounded-lg border border-(--color-line) px-3 disabled:opacity-40">
              Previous
            </button>
            <span>Page {data.page} of {data.pages} · {data.total} orders</span>
            <button type="button" disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 rounded-lg border border-(--color-line) px-3 disabled:opacity-40">
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OrderDetailView({
  slug, id, onBack,
}: { slug: string; id: string; onBack: () => void }) {
  const [o, setO] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setO(await getOrder(slug, id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, id]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const reason = window.prompt("Reason for cancelling (optional)") ?? undefined;
    return act(() => cancelOrder(slug, id, reason || undefined));
  };

  if (!o) {
    return (
      <div>
        <button type="button" onClick={onBack} className="mb-4 underline">Back to orders</button>
        {error ? <p className="text-(--color-danger)">{error}</p>
               : <p className="text-(--color-ink-muted)">Loading…</p>}
      </div>
    );
  }

   const canCancel = o.allowedTransitions.includes("CANCELLED");
  // Gate retry on the status itself, not the transition: DRAFT also permits
  // PENDING, but the retry endpoint accepts FAILED only and answers 400.
  const canRetry = o.status === "FAILED";
  const canSend = o.status === "PENDING";
  const canVerify = o.status === "SENT";
  return (
    <div className="max-w-3xl">
      <button type="button" onClick={onBack} className="mb-4 underline">Back to orders</button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-xl">{o.reference}</h2>
          <p className={`text-sm ${statusClass(o.status)}`}>{o.status}</p>
        </div>
        <div className="flex gap-2">
          {canSend ? (
            <button type="button" disabled={busy} onClick={() => act(() => submitOrder(slug, id))}
              className="h-10 rounded-lg bg-(--color-brand) px-4 font-medium text-(--color-brand-ink) disabled:opacity-50">
              Send now
            </button>
          ) : null}
          {canVerify ? (
            <button type="button" disabled={busy} onClick={() => act(() => verifyOrder(slug, id))}
              className="h-10 rounded-lg border border-(--color-line) px-4 disabled:opacity-50">
              Check with unTill
            </button>
          ) : null}
          {canRetry ? (
            <button type="button" disabled={busy} onClick={() => act(() => retryOrder(slug, id))}
              className="h-10 rounded-lg bg-(--color-brand) px-4 font-medium text-(--color-brand-ink) disabled:opacity-50">
              Send again
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" disabled={busy} onClick={cancel}
              className="h-10 rounded-lg border border-(--color-danger) px-4 text-(--color-danger) disabled:opacity-50">
              Cancel order
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-(--color-danger)">{error}</p> : null}

      <div className={`mb-6 ${card}`}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Pair k="Type" v={o.orderType} />
          <Pair k="Table" v={`${o.tableNumber ?? "—"}${o.tablePart ? ` ${o.tablePart}` : ""}`} />
          <Pair k="Covers" v={o.covers ?? "—"} />
          <Pair k="Business date" v={String(o.businessDate).slice(0, 10)} />
          <Pair k="Created" v={when(o.createdAt)} />
          <Pair k="Sent" v={when(o.sentAt)} />
          <Pair k="Confirmed" v={when(o.confirmedAt)} />
          <Pair k="Cancelled" v={when(o.cancelledAt)} />
        </dl>
      </div>

      {o.tpapi.lastError || o.tpapi.returnCode !== null || o.tpapi.attempts > 1 ? (
        <div className={`mb-6 ${card}`}>
          <p className="mb-2 font-medium">unTill</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Pair k="Attempts" v={o.tpapi.attempts} />
            <Pair k="Return code" v={o.tpapi.returnCode ?? "—"} />
            <Pair k="Correlation" v={o.tpapi.correlationId ?? "—"} />
          </dl>
          {o.tpapi.lastError ? (
            <p className="mt-3 text-sm text-(--color-danger)">{o.tpapi.lastError}</p>
          ) : null}
        </div>
      ) : null}

      <div className={`mb-6 ${card}`}>
        <p className="mb-3 font-medium">Items</p>
        <table className="w-full text-sm">
          <tbody>
            {o.items.map((i) => (
              <tr key={`${i.lineNumber}-${i.parentLineNumber ?? "p"}`}
                className="border-b border-(--color-line) last:border-0">
                <td className={`py-2 ${i.parentLineNumber !== null ? "ps-6 text-(--color-ink-muted)" : ""}`}>
                  {i.displayName ?? i.articleName}
                  {i.sizeName ? <span className="ms-2 text-xs text-(--color-ink-muted)">{i.sizeName}</span> : null}
                  {i.text ? <span className="ms-2 text-xs italic">{i.text}</span> : null}
                </td>
                <td className="py-2 text-end tabular-nums">{i.quantity}×</td>
                <td className="py-2 text-end tabular-nums">{i.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-end tabular-nums">{i.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="pt-3 text-end text-(--color-ink-muted)">Subtotal</td>
              <td className="pt-3 text-end tabular-nums">{o.subtotal.toFixed(2)}</td></tr>
            <tr><td colSpan={3} className="text-end text-(--color-ink-muted)">Tax</td>
              <td className="text-end tabular-nums">{o.taxTotal.toFixed(2)}</td></tr>
            <tr><td colSpan={3} className="text-end font-medium">Total</td>
              <td className="text-end font-medium tabular-nums">{money(o.total, o.currency)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className={card}>
        <p className="mb-3 font-medium">History</p>
        {o.history.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">Nothing recorded.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {o.history.map((h, idx) => (
              <li key={h.id ?? idx} className="flex flex-wrap gap-x-3">
                <span className="text-(--color-ink-muted)">{when(h.createdAt ?? h.at)}</span>
                <span>
                  {h.fromStatus ? `${h.fromStatus} → ` : ""}
                  {h.toStatus ?? h.status ?? "—"}
                </span>
                {h.actor || h.actorType ? (
                  <span className="text-(--color-ink-muted)">{h.actor ?? h.actorType}</span>
                ) : null}
                {h.reason ? <span className="italic">{h.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string | number }) {
  return (
    <div>
      <dt className="text-(--color-ink-muted)">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}