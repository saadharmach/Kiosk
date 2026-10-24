"use client";

import { useCallback, useEffect, useState } from "react";
import { reprintOrder } from "@/lib/printer";
import {
  ORDER_STATUSES, cancelOrder, getOrder, listOrders, money, retryOrder,
  submitOrder, verifyOrder, when,
  type OrderDetail, type OrderPage, type OrderRow,
} from "@/lib/orders";
import { ORDER_STATUS, type OrderStatus } from "@/lib/dashboard";

const field = "field w-auto";
const card = "card";
const lbl = "field-label";

/** The order's state as a badge, in French. */
function StatusBadge({ s }: { s: string }) {
  const [label, badge] = ORDER_STATUS[s as OrderStatus] ?? [s, "badge-muted"];
  return <span className={`badge ${badge}`}>{label}</span>;
}
const TYPE: Record<string, string> = { EAT_IN: "Sur place", TAKE_AWAY: "À emporter", DELIVERY: "Livraison" };

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
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <label className={lbl} htmlFor="o-status">Statut</label>
          <select id="o-status" className={field} value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">Tous les statuts</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS[s][0]}</option>)}
          </select>
        </div>

        <div className="min-w-48 flex-1">
          <label className={lbl} htmlFor="o-ref">Référence</label>
          <input id="o-ref" type="search" className="field" value={reference}
            placeholder="K0-0929"
            onChange={(e) => { setPage(1); setReference(e.target.value); }} />
        </div>

        <div>
          <label className={lbl} htmlFor="o-from">Du</label>
          <input id="o-from" type="date" className={field} value={from}
            onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        </div>

        <div>
          <label className={lbl} htmlFor="o-to">Au</label>
          <input id="o-to" type="date" className={field} value={to}
            onChange={(e) => { setPage(1); setTo(e.target.value); }} />
        </div>

        <button type="button" onClick={load} className="btn btn-secondary">Actualiser</button>
      </div>

      {error ? <p role="alert" className="note note-err">{error}</p> : null}

      {!data ? (
        <p className="text-(--color-ink-muted)">Chargement…</p>
      ) : data.orders.length === 0 ? (
        <p className="card text-(--color-ink-muted)">
          Aucune commande ne correspond à ces filtres. Effacez les dates ou la référence pour tout voir.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Statut</th>
                <th>Type</th>
                <th className="text-end">Table</th>
                <th className="text-end">Articles</th>
                <th className="text-end">Total</th>
                <th>Créée</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o: OrderRow) => (
                <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer">
                  <td className="font-bold whitespace-nowrap">{o.reference}</td>
                  <td>
                    <StatusBadge s={o.status} />
                    {o.tpapiLastError ? (
                      <span className="ms-2 text-[12px] text-(--color-ink-muted)">{o.tpapiLastError.slice(0, 40)}</span>
                    ) : null}
                  </td>
                  <td>{TYPE[o.orderType] ?? o.orderType}</td>
                  <td className="text-end tabular-nums">{o.tableNumber ?? "—"}</td>
                  <td className="text-end tabular-nums">{o.itemCount}</td>
                  <td className="text-end whitespace-nowrap tabular-nums">{money(o.total, o.currency)}</td>
                  <td className="whitespace-nowrap text-(--color-ink-muted)">{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t border-(--color-line) px-3.5 py-2.5 text-[12.5px] text-(--color-ink-muted)">
            <span>{data.total} commande{data.total === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost btn-sm">Précédente</button>
              Page {data.page} / {data.pages}
              <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost btn-sm">Suivante</button>
            </span>
          </div>
        </div>
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
  const [printNote, setPrintNote] = useState<string | null>(null);

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

  const printTicket = () => {
    setPrintNote(null);
    return act(async () => {
      await reprintOrder(slug, id);
      setPrintNote("Ticket en file d’attente. Il s’imprime dès que l’application NEXBORN Helper le récupère.");
    });
  };

  const cancel = () => {
    const reason = window.prompt("Motif de l’annulation (facultatif)") ?? undefined;
    return act(() => cancelOrder(slug, id, reason || undefined));
  };

  if (!o) {
    return (
      <div>
        <button type="button" onClick={onBack} className="btn btn-ghost mb-4">← Retour aux commandes</button>
        {error ? <p className="note note-err">{error}</p>
               : <p className="text-(--color-ink-muted)">Chargement…</p>}
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
    <div className="flex max-w-3xl flex-col gap-4">
      <button type="button" onClick={onBack} className="btn btn-ghost self-start">← Retour aux commandes</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[19px] font-bold">{o.reference}</h2>
          <StatusBadge s={o.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={printTicket} className="btn btn-secondary">Imprimer le ticket</button>
          {canSend ? (
            <button type="button" disabled={busy} onClick={() => act(() => submitOrder(slug, id))} className="btn btn-primary">Envoyer maintenant</button>
          ) : null}
          {canVerify ? (
            <button type="button" disabled={busy} onClick={() => act(() => verifyOrder(slug, id))} className="btn btn-secondary">Vérifier avec unTill</button>
          ) : null}
          {canRetry ? (
            <button type="button" disabled={busy} onClick={() => act(() => retryOrder(slug, id))} className="btn btn-primary">Renvoyer</button>
          ) : null}
          {canCancel ? (
            <button type="button" disabled={busy} onClick={cancel} className="btn btn-danger">Annuler la commande</button>
          ) : null}
        </div>
      </div>

      {error ? <p role="alert" className="note note-err">{error}</p> : null}
      {printNote ? <p className="note note-ok" role="status">{printNote}</p> : null}

      <div className={card}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Pair k="Type" v={TYPE[o.orderType] ?? o.orderType} />
          <Pair k="Table" v={`${o.tableNumber ?? "—"}${o.tablePart ? ` ${o.tablePart}` : ""}`} />
          <Pair k="Couverts" v={o.covers ?? "—"} />
          <Pair k="Journée" v={String(o.businessDate).slice(0, 10)} />
          <Pair k="Créée" v={when(o.createdAt)} />
          <Pair k="Envoyée" v={when(o.sentAt)} />
          <Pair k="Confirmée" v={when(o.confirmedAt)} />
          <Pair k="Annulée" v={when(o.cancelledAt)} />
        </dl>
      </div>

      {o.tpapi.lastError || o.tpapi.returnCode !== null || o.tpapi.attempts > 1 ? (
        <div className={card}>
          <h3 className="card-title">unTill</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Pair k="Tentatives" v={o.tpapi.attempts} />
            <Pair k="Code retour" v={o.tpapi.returnCode ?? "—"} />
            <Pair k="Corrélation" v={o.tpapi.correlationId ?? "—"} />
          </dl>
          {o.tpapi.lastError ? (
            <p className="note note-err mt-3">{o.tpapi.lastError}</p>
          ) : null}
        </div>
      ) : null}

      <div className={card}>
        <h3 className="card-title">Articles</h3>
        <table className="w-full">
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
            <tr><td colSpan={3} className="pt-3 text-end text-(--color-ink-muted)">Sous-total</td>
              <td className="pt-3 text-end tabular-nums">{o.subtotal.toFixed(2)}</td></tr>
            <tr><td colSpan={3} className="text-end text-(--color-ink-muted)">TVA</td>
              <td className="text-end tabular-nums">{o.taxTotal.toFixed(2)}</td></tr>
            <tr><td colSpan={3} className="text-end font-bold">Total</td>
              <td className="text-end font-bold tabular-nums">{money(o.total, o.currency)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className={card}>
        <h3 className="card-title">Historique</h3>
        {o.history.length === 0 ? (
          <p className="text-(--color-ink-muted)">Rien d’enregistré.</p>
        ) : (
          <ol className="space-y-2">
            {o.history.map((h, idx) => (
              <li key={h.id ?? idx} className="flex flex-wrap gap-x-3">
                <span className="text-(--color-ink-muted)">{when(h.createdAt ?? h.at)}</span>
                <span className="flex items-center gap-1.5">
                  {h.fromStatus ? <><StatusBadge s={h.fromStatus} />→</> : null}
                  {h.toStatus ?? h.status ? <StatusBadge s={(h.toStatus ?? h.status)!} /> : "—"}
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
      <dt className="text-[12.5px] text-(--color-ink-muted)">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}