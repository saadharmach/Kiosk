"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  NEEDS_ATTENTION, getOrder, listOrders, retryOrder, verifyOrder,
  type OrderDetail, type OrderRow, type OrderStatus,
} from "@/lib/platform";
import { ErrorText, input, secondary, when } from "./ui";

const TONE: Record<OrderStatus, string> = {
  DRAFT: "bg-(--color-surface-2) text-(--color-ink-muted)",
  PENDING: "bg-amber-100 text-amber-900",
  SENT: "bg-sky-100 text-sky-900",
  CONFIRMED: "bg-(--color-brand) text-(--color-brand-ink)",
  PAID: "bg-(--color-surface-2) text-(--color-ink)",
  FAILED: "bg-red-100 text-red-900",
  CANCELLED: "bg-(--color-surface-2) text-(--color-ink-muted)",
};
const STATUS_HELP: Partial<Record<OrderStatus, string>> = {
  PENDING: "Waiting to be sent to the till.",
  SENT: "The till accepted it, but it has not been confirmed there yet.",
  CONFIRMED: "Found on the till.",
  PAID: "Closed on the till.",
  FAILED: "The till refused it, or it could not be confirmed.",
  CANCELLED: "Cancelled; it will not be made.",
};

const FILTERS: [label: string, value: string][] = [
  ["All", ""], ["Needs a look", NEEDS_ATTENTION], ["Failed", "FAILED"], ["Pending", "PENDING"],
  ["Sent", "SENT"], ["Confirmed", "CONFIRMED"], ["Paid", "PAID"], ["Cancelled", "CANCELLED"],
];

const money = (n: number, c: string) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n); } catch { return `${n.toFixed(2)} ${c}`; } };
export const StatusPill = ({ s }: { s: OrderStatus }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[s]}`}>{s.toLowerCase()}</span>;

function Detail({ id, orderId, canWrite, onChanged }: { id: string; orderId: string; canWrite: boolean; onChanged: () => void }) {
  const [d, setD] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getOrder(id, orderId).then(setD).catch((e) => setError((e as Error).message)); }, [id, orderId]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setNote(null);
    try { await fn(); load(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!d) return <div className="p-4"><ErrorText message={error} />{!error ? <p className="text-sm text-(--color-ink-muted)">Loading…</p> : null}</div>;

  return (
    <div className="grid gap-6 bg-(--color-surface-2) p-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 font-medium">What was ordered</h3>
        <ul className="space-y-1 text-sm">
          {d.items.map((i) => (
            <li key={i.lineNumber} className={`flex justify-between gap-3 ${i.parentLineNumber ? "ps-5 text-(--color-ink-muted)" : ""}`}>
              <span>{i.parentLineNumber ? "+ " : `${i.quantity} × `}{i.displayName ?? i.articleName}{i.sizeName ? ` (${i.sizeName})` : ""}{i.text ? ` — ${i.text}` : ""}</span>
              <span className="shrink-0 tabular-nums">{i.lineTotal ? money(i.lineTotal, d.currency) : ""}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-(--color-line) pt-2 font-medium"><span>Total</span><span className="tabular-nums">{money(d.total, d.currency)}</span></p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-2 font-medium">With the till</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-(--color-ink-muted)">Attempts</dt><dd>{d.tpapi.attempts}</dd>
            <dt className="text-(--color-ink-muted)">Answer code</dt><dd>{d.tpapi.returnCode ?? "—"}</dd>
            <dt className="text-(--color-ink-muted)">Sent</dt><dd>{when(d.sentAt)}</dd>
            <dt className="text-(--color-ink-muted)">Confirmed</dt><dd>{when(d.confirmedAt)}</dd>
            {d.tpapi.correlationId ? <><dt className="text-(--color-ink-muted)">Trace id</dt><dd className="font-mono text-xs break-all">{d.tpapi.correlationId}</dd></> : null}
          </dl>
          {d.tpapi.lastError ? <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">Last error: {d.tpapi.lastError}</p> : null}
        </div>

        <div>
          <h3 className="mb-2 font-medium">What happened</h3>
          <ol className="space-y-1 text-sm">
            {d.history.map((h, n) => (
              <li key={n}><span className="text-(--color-ink-muted)">{when(h.createdAt)}</span> · {h.fromStatus ? `${h.fromStatus.toLowerCase()} → ` : ""}<strong>{h.toStatus.toLowerCase()}</strong> · {h.actor.toLowerCase().replace("_", " ")}{h.reason ? ` · ${h.reason}` : ""}</li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {d.status === "SENT" ? (
            <button className={secondary} disabled={busy} onClick={() => act(async () => {
              const r = await verifyOrder(id, orderId);
              setNote(r.unreachable ? "Could not reach the till to look. Try again in a moment." : r.confirmed ? "Found on the till: confirmed." : "Not found among the till's open orders. It may already be closed there, or it never arrived.");
            })}>{busy ? "Checking…" : "Check the till again"}</button>
          ) : null}
          {d.status === "FAILED" && canWrite ? (
            <button className={secondary} disabled={busy} onClick={() => {
              if (window.confirm(`Send ${d.reference} to the till again?\n\nFirst look on the till: if the order is already there, sending it again means the kitchen makes it twice.`)) void act(async () => { await retryOrder(id, orderId); setNote("Back in the queue: it will be sent to the till within seconds."); });
            }}>{busy ? "Working…" : "Send to the till again"}</button>
          ) : null}
          {STATUS_HELP[d.status] ? <span className="text-sm text-(--color-ink-muted)">{STATUS_HELP[d.status]}</span> : null}
        </div>
        {note ? <p role="status" className="text-sm">{note}</p> : null}
        <ErrorText message={error} />
      </div>
    </div>
  );
}

export default function OrdersTab({ id, canWrite, initialFilter }: { id: string; canWrite: boolean; initialFilter?: string }) {
  const [filter, setFilter] = useState(initialFilter ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ orders: OrderRow[]; total: number; page: number; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    const mine = ++latest.current;
    listOrders(id, { status: filter, reference: search.trim(), page })
      .then((d) => { if (mine === latest.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === latest.current) setError((e as Error).message); });
  }, [id, filter, search, page]);
  // The newest request wins, so a slow answer never overwrites a later one.
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {FILTERS.map(([label, value]) => (
            <button key={label} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setOpenId(null); }}
              className={`rounded-full px-3 py-1 text-sm ${filter === value ? "bg-(--color-brand) text-(--color-brand-ink)" : "border border-(--color-line) hover:bg-(--color-surface-2)"}`}>{label}</button>
          ))}
        </div>
        <input type="search" aria-label="Search by reference" placeholder="Reference, e.g. K0-1001" value={search} className={input + " ms-auto max-w-56"}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <ErrorText message={error} />

      {!data ? (error ? null : <p className="text-(--color-ink-muted)">Loading…</p>) : data.orders.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-8 text-center text-(--color-ink-muted)">{filter || search ? "No order matches." : "No orders yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
          <table className="w-full text-sm">
            <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["Order", "Status", "When", "Type", "Items", "Total", ""].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-(--color-line)">
              {data.orders.map((o) => (
                <Fragment key={o.id}>
                  <tr className="hover:bg-(--color-surface-2)">
                    <td className="px-4 py-3 font-medium">{o.reference}{o.tpapiLastError ? <div className="max-w-xs truncate text-xs font-normal text-(--color-danger)" title={o.tpapiLastError}>{o.tpapiLastError}</div> : null}</td>
                    <td className="px-4 py-3"><StatusPill s={o.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-(--color-ink-muted)">{when(o.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{o.orderType.toLowerCase().replace("_", " ")}{o.tableNumber !== null ? ` · ${o.tableNumber}` : ""}</td>
                    <td className="px-4 py-3">{o.itemCount}</td>
                    <td className="px-4 py-3 tabular-nums">{money(o.total, o.currency)}</td>
                    <td className="px-4 py-3 text-end"><button aria-expanded={openId === o.id} className={secondary + " h-8"} onClick={() => setOpenId(openId === o.id ? null : o.id)}>{openId === o.id ? "Close" : "Details"}</button></td>
                  </tr>
                  {openId === o.id ? <tr><td colSpan={7} className="p-0"><Detail id={id} orderId={o.id} canWrite={canWrite} onChanged={load} /></td></tr> : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          <button className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span>Page {data.page} of {data.pages} · {data.total} orders</span>
          <button className={secondary} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      ) : null}
    </div>
  );
}
