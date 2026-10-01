"use client";

import { useCallback, useEffect, useState } from "react";
import { getRestaurant, type RestaurantDetail, type RestaurantTab } from "@/lib/platform";
import ActivityTab from "./ActivityTab";
import ConnectionTab from "./ConnectionTab";
import DetailsTab from "./DetailsTab";
import UsersTab from "./UsersTab";
import { PosBadge, StatusBadge, secondary } from "./ui";

const TABS: RestaurantTab[] = ["Details", "unTill", "Users", "Activity"];
type Tab = RestaurantTab;

export default function RestaurantPage({ id, canWrite, initialTab = "Details", onBack }: { id: string; canWrite: boolean; initialTab?: RestaurantTab; onBack: () => void }) {
  const [r, setR] = useState<RestaurantDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  const load = useCallback(() => {
    getRestaurant(id).then((d) => { setR(d); setFailed(null); }).catch((e) => setFailed((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  if (failed) return <><button onClick={onBack} className={secondary}>← Restaurants</button><p className="mt-4 text-(--color-danger)">{failed}</p></>;
  if (!r) return <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <>
      <button onClick={onBack} className="mb-4 text-sm text-(--color-ink-muted) underline">← Back</button>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <StatusBadge status={r.status} />
        <PosBadge health={r.tpapi} />
        <span className="text-sm text-(--color-ink-muted)">/r/{r.slug} · {r._count.orders} orders</span>
      </div>

      <div role="tablist" className="mb-6 flex gap-1 border-b border-(--color-line)">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 ${t === tab ? "border-(--color-brand) font-medium" : "border-transparent text-(--color-ink-muted) hover:text-(--color-ink)"}`}>
            {t}
          </button>
        ))}
      </div>

      {!canWrite ? <p className="mb-4 rounded-lg bg-(--color-surface-2) p-3 text-sm text-(--color-ink-muted)">Read-only: your support account can look at everything and run a sync, but not change anything.</p> : null}

      {tab === "Details" ? <DetailsTab r={r} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "unTill" ? <ConnectionTab id={r.id} canWrite={canWrite} onChanged={load} /> : null}
      {tab === "Users" ? <UsersTab id={r.id} canWrite={canWrite} /> : null}
      {tab === "Activity" ? <ActivityTab id={r.id} /> : null}
    </>
  );
}
