"use client";

import { useCallback, useEffect, useState } from "react";
import { ORDER_STATUS, getDashboard, mad, type Dashboard } from "@/lib/dashboard";
import { since } from "./frame";

function Stat({ label, value, dot }: { label: string; value: string | number; dot?: "on" | "off" }) {
  return (
    <div className="card">
      <p className="flex items-center gap-2 text-[12.5px] text-(--color-ink-muted)">
        {dot ? <span className={`dot ${dot === "off" ? "dot-off" : ""}`} /> : null}
        {label}
      </p>
      <p className="mt-1.5 text-[28px] leading-tight font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** What the restaurant looks like right now: bornes, today's orders, the till. Refreshed every 30 seconds. */
export default function DashboardPage({ slug, onOpen }: { slug: string; onOpen: (section: "orders" | "bornes") => void }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    getDashboard(slug).then((x) => { setD(x); setFailed(false); }, () => setFailed(true));
  }, [slug]);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (!d) return failed ? <p className="note note-err">Impossible de charger le tableau de bord.</p> : <p className="text-(--color-ink-muted)">Chargement…</p>;

  const known = d.bornes.online !== null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      {failed ? <p className="note note-warn">Connexion perdue : les chiffres ci-dessous peuvent dater.</p> : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Stat label="Bornes configurées" value={d.bornes.configured} />
        {known ? <Stat label="En ligne" value={d.bornes.online!} dot="on" /> : null}
        {known ? <Stat label="Hors ligne" value={d.bornes.offline!} dot="off" /> : null}
        <Stat label="Commandes aujourd’hui" value={d.orders.count} />
        <Stat label="Ventes aujourd’hui" value={mad(d.orders.revenue, d.currency)} />
      </div>
      {!known && d.bornes.configured > 0 ? (
        <p className="note note-info">
          L’état en ligne / hors ligne apparaît quand l’écran de la borne est enregistré (Bornes › Enregistrer un écran).
        </p>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
        <section className="card">
          <h2 className="card-title">Connexion à la caisse unTill</h2>
          {d.till ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2">
                <span className={`badge ${d.till.reachable ? "badge-ok" : "badge-err"}`}>{d.till.reachable ? "Joignable" : "Injoignable"}</span>
                <span className="text-(--color-ink-muted)">
                  {d.till.reachable ? "Les bornes peuvent envoyer les commandes." : "Les bornes affichent « Pas de connexion »."}
                </span>
              </p>
              {d.till.lastSyncAt ? (
                <p className="text-(--color-ink-muted)">Catalogue synchronisé {since(d.till.lastSyncAt, "fr")}.</p>
              ) : <p className="text-(--color-ink-muted)">Le catalogue n’a jamais été synchronisé.</p>}
              {d.lastSync && d.lastSync.status === "FAILED" ? (
                <p className="note note-err">Dernière synchronisation en échec{d.lastSync.error ? ` : ${d.lastSync.error}` : "."}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-(--color-ink-muted)">Aucune caisse n’est encore reliée. L’équipe NEXBORN s’en occupe.</p>
          )}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="card-title mb-0">Dernières commandes</h2>
            <button onClick={() => onOpen("orders")} className="btn btn-ghost btn-sm">Tout voir</button>
          </div>
          {d.recentOrders.length === 0 ? (
            <p className="text-(--color-ink-muted)">Aucune commande pour le moment.</p>
          ) : (
            <ul className="flex flex-col">
              {d.recentOrders.map((o) => {
                const [label, badge] = ORDER_STATUS[o.status];
                return (
                  <li key={o.reference + o.at} className="flex items-center gap-2.5 border-b border-(--color-line) py-2.5 last:border-0">
                    <span className={`badge ${badge}`}>{label}</span>
                    <span className="min-w-0 truncate font-semibold">{o.reference}</span>
                    <span className="flex-1" />
                    <span className="tabular-nums">{mad(o.total, d.currency)}</span>
                    <small className="w-12 text-end text-(--color-ink-muted) tabular-nums">{time(o.at)}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {d.bornes.list.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[14.5px] font-bold">Bornes</h2>
            <button onClick={() => onOpen("bornes")} className="btn btn-ghost btn-sm">Gérer les bornes</button>
          </div>
          <div className="table-wrap">
            <table className="table min-w-[520px]">
              <thead><tr><th>Borne</th><th>Code</th><th>Statut</th><th>Dernier contact</th></tr></thead>
              <tbody>
                {d.bornes.list.map((b) => {
                  const [label, badge] = !b.enabled ? ["Désactivée", "badge-muted"]
                    : !b.registered ? ["Écran non enregistré", "badge-warn"]
                    : b.online ? ["En ligne", "badge-ok"] : ["Hors ligne", "badge-err"];
                  return (
                    <tr key={b.code}>
                      <td className="font-semibold">{b.name}</td>
                      <td className="tabular-nums">{b.code}</td>
                      <td><span className={`badge ${badge}`}>{label}</span></td>
                      <td className="text-(--color-ink-muted)">{b.lastSeenAt ? since(b.lastSeenAt, "fr") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
