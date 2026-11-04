"use client";

import { useCallback, useEffect, useState } from "react";
import { getOverview, tabFor, type AttentionItem, type Overview, type RestaurantTab, type Severity } from "@/lib/platform";
import { ErrorText, secondary } from "./ui";

const LABEL: Record<Severity, string> = { problem: "Problem", warning: "Heads-up", setup: "Not finished" };
const STYLE: Record<Severity, string> = { problem: "badge-err", warning: "badge-warn", setup: "badge-muted" };

const readable = (action: string) => {
  const [what, ...rest] = action.split(".");
  return `${(what ?? "").replace(/_/g, " ")}${rest.length ? `: ${rest.join(" ").replace(/_/g, " ")}` : ""}`;
};

function Tile({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "bad" | "good" }) {
  return (
    <div className="card">
      <p className="text-[12.5px] text-(--color-ink-muted)">{label}</p>
      <p className={`mt-1.5 text-[28px] leading-tight font-bold ${tone === "bad" ? "text-(--color-danger)" : tone === "good" ? "text-(--color-brand)" : ""}`}>{value}</p>
      {note ? <p className="mt-1 text-sm text-(--color-ink-muted)">{note}</p> : null}
    </div>
  );
}

export default function OverviewPage({ onOpen }: { onOpen: (id: string, tab?: RestaurantTab, filter?: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    getOverview()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, []);

  // Fresh on arrival, then every minute while the page is open.
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const problems = data?.attention.filter((a) => a.severity === "problem").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-end gap-4">
        {data ? <span className="flex items-center gap-1.5 text-[12.5px] text-(--color-ink-muted)"><span className="dot" />Updated {new Date(data.generatedAt).toLocaleTimeString()}</span> : null}
        <button onClick={load} disabled={busy} className={secondary}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
      <ErrorText message={error} />
      {!data ? (error ? null : <p className="text-(--color-ink-muted)">Loading…</p>) : (
        <>
          <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Active restaurants" value={data.restaurants.ACTIVE}
              note={[data.restaurants.SUSPENDED ? `${data.restaurants.SUSPENDED} suspended` : "", data.restaurants.ARCHIVED ? `${data.restaurants.ARCHIVED} archived` : ""].filter(Boolean).join(" · ") || undefined} />
            <Tile label="Orders, last 24 hours" value={data.orders.last24h} />
            <Tile label="Orders, last 7 days" value={data.orders.last7d} />
            <Tile label="Problems right now" value={problems === 0 ? "None" : problems} tone={problems === 0 ? "good" : "bad"} />
          </section>

          <section aria-label="Needs attention">
            <h2 className="mb-2.5 text-[14.5px] font-bold">Needs attention</h2>
            {data.attention.length === 0 ? (
              <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-8 text-center text-(--color-ink-muted)">Everything looks fine.</p>
            ) : (
              <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)">
                {data.attention.map((a: AttentionItem) => (
                  <li key={`${a.restaurantId}:${a.kind}`}>
                    <button onClick={() => onOpen(a.restaurantId, tabFor(a.kind), a.kind === "ORDERS_FAILED" ? "FAILED" : a.kind === "ORDERS_STUCK" ? "PENDING,SENT" : undefined)} className="flex w-full items-start gap-4 p-4 text-start hover:bg-(--color-page)">
                      <span className={`badge mt-0.5 w-24 shrink-0 justify-center ${STYLE[a.severity]}`}>{LABEL[a.severity]}</span>
                      <span className="min-w-0 flex-1"><span className="font-medium">{a.name}</span><span className="block text-sm text-(--color-ink-muted)">{a.message}</span></span>
                      <span aria-hidden className="text-(--color-ink-muted)">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Recent activity">
            <h2 className="mb-2.5 text-[14.5px] font-bold">Recent activity</h2>
            {data.recentActivity.length === 0 ? <p className="text-(--color-ink-muted)">Nothing yet.</p> : (
              <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) text-sm">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <span className="w-full shrink-0 text-(--color-ink-muted) sm:w-44">{new Date(a.at).toLocaleString()}</span>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {a.restaurantId ? <button onClick={() => onOpen(a.restaurantId!, "Activity")} className="font-medium underline-offset-2 hover:underline">{a.restaurant ?? "a restaurant"}</button> : null}
                      {" "}· {readable(a.action)} · <span className="text-(--color-ink-muted)">{a.actor ?? "unknown"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
