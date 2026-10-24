"use client";

import { useCallback, useEffect, useState } from "react";
import { getReadiness, getRestaurant, type Readiness, type RestaurantDetail, type RestaurantTab } from "@/lib/platform";
import ActivityTab from "./ActivityTab";
import ConnectionTab from "./ConnectionTab";
import DetailsTab from "./DetailsTab";
import SubscriptionTab from "./SubscriptionTab";
import GoLiveTab from "./GoLiveTab";
import OrdersTab from "./OrdersTab";
import TillLogTab from "./TillLogTab";
import UsersTab from "./UsersTab";
import { PosBadge, StatusBadge, secondary } from "./ui";

const TABS: RestaurantTab[] = ["Go-live", "Subscription", "Details", "unTill", "Users", "Orders", "Till log", "Activity"];
type Tab = RestaurantTab;

export default function RestaurantPage({ id, canWrite, initialTab = "Go-live", initialFilter, onBack }: { id: string; canWrite: boolean; initialTab?: RestaurantTab; initialFilter?: string; onBack: () => void }) {
  const [r, setR] = useState<RestaurantDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  // Reloaded after anything changes, so the checklist and the badge never show yesterday's state.
  const load = useCallback(() => {
    getRestaurant(id).then((d) => { setR(d); setFailed(null); }).catch((e) => setFailed((e as Error).message));
    getReadiness(id).then(setReadiness).catch(() => setReadiness(null));
  }, [id]);
  useEffect(load, [load]);

  if (failed) return <><button onClick={onBack} className={secondary}>← Restaurants</button><p className="mt-4 text-(--color-danger)">{failed}</p></>;
  if (!r) return <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <>
      <button onClick={onBack} className="btn btn-ghost mb-2">← Back</button>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-[19px] font-bold">{r.name}</h2>
        <StatusBadge status={r.status} />
        <PosBadge health={r.tpapi} />
        {readiness ? (
          <button onClick={() => setTab("Go-live")}
            className={`badge cursor-pointer ${readiness.ready ? "badge-ok" : "badge-warn"}`}>
            {readiness.ready ? "Ready to go live" : `${readiness.requiredTotal - readiness.requiredDone} to do before going live`}
          </button>
        ) : null}
        <span className="text-sm text-(--color-ink-muted)">/r/{r.slug} · {r._count.orders} orders</span>
      </div>

      <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-(--color-line)">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3.5 py-2.5 font-semibold ${t === tab ? "border-(--color-brand) text-(--color-brand)" : "border-transparent text-(--color-ink-muted) hover:text-(--color-ink)"}`}>
            {t}
          </button>
        ))}
      </div>

      {!canWrite ? <p className="mb-4 note note-info">Read-only: your support account can look at everything and run a sync, but not change anything.</p> : null}

      {tab === "Go-live" ? <GoLiveTab r={r} readiness={readiness} onOpenTab={setTab} /> : null}
      {tab === "Subscription" ? <SubscriptionTab id={r.id} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "Details" ? <DetailsTab r={r} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "unTill" ? <ConnectionTab id={r.id} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "Users" ? <UsersTab id={r.id} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "Orders" ? <OrdersTab id={r.id} canWrite={canWrite} initialFilter={initialFilter} /> : null}
      {tab === "Till log" ? <TillLogTab id={r.id} /> : null}
      {tab === "Activity" ? <ActivityTab id={r.id} /> : null}
    </>
  );
}
