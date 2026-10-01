"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ago, createRestaurant, listRestaurants, type NewRestaurant, type Page, type RestaurantRow } from "@/lib/platform";
import { ErrorText, Field, PosBadge, StatusBadge, input, primary, secondary } from "./ui";

const EMPTY: NewRestaurant = { slug: "", name: "", currency: "MAD", locale: "fr", country: "MA" };

function NewRestaurantForm({ onCreated, onCancel }: { onCreated: (r: RestaurantRow) => void; onCancel: () => void }) {
  const [f, setF] = useState<NewRestaurant>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof NewRestaurant) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          // Empty optional fields are left out, not sent as "".
          const body = Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as unknown as NewRestaurant;
          onCreated(await createRestaurant(body));
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}
      className="mb-6 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5"
    >
      <h2 className="mb-4 text-lg font-medium">New restaurant</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Name"><input required minLength={2} maxLength={120} className={input} value={f.name} onChange={set("name")} /></Field>
        <Field label="Address on the kiosk" hint="Lowercase letters, digits and dashes. It becomes /r/<this> and can never change.">
          <input required pattern="[a-z0-9]([a-z0-9\-]{0,58}[a-z0-9])?" className={input} value={f.slug}
            onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
        </Field>
        <Field label="City"><input maxLength={120} className={input} value={f.city ?? ""} onChange={set("city")} /></Field>
        <Field label="Currency"><input required minLength={3} maxLength={3} className={input} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Main language">
          <select className={input} value={f.locale} onChange={set("locale")}>
            <option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option>
          </select>
        </Field>
        <Field label="Country (2 letters)"><input minLength={2} maxLength={2} className={input} value={f.country ?? ""} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} /></Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={busy} className={primary}>{busy ? "Creating…" : "Create restaurant"}</button>
        <button type="button" onClick={onCancel} className={secondary}>Cancel</button>
        <ErrorText message={error} />
      </div>
    </form>
  );
}

export default function RestaurantsPage({ canWrite, onOpen }: { canWrite: boolean; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<RestaurantRow> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);

  const load = useCallback(() => {
    const mine = ++latest.current;
    listRestaurants({ q: q.trim(), status, page })
      .then((d) => { if (mine === latest.current) { setData(d); setFailed(null); } })
      .catch((e) => { if (mine === latest.current) setFailed((e as Error).message); });
  }, [q, status, page]);

  // The newest request wins, so a slow answer never overwrites a later one.
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-semibold">Restaurants</h1>
        <input type="search" aria-label="Search restaurants" placeholder="Search by name or address" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} className={input + " max-w-xs"} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={input + " max-w-40"}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option>
        </select>
        {canWrite ? <button onClick={() => setAdding(true)} className={primary}>New restaurant</button> : null}
      </div>

      {adding ? <NewRestaurantForm onCancel={() => setAdding(false)} onCreated={(r) => { setAdding(false); onOpen(r.id); }} /> : null}
      <ErrorText message={failed} />

      {!data ? <p className="text-(--color-ink-muted)">Loading…</p> : data.items.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-8 text-center text-(--color-ink-muted)">
          {q || status ? "No restaurant matches." : "No restaurant yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
          <table className="w-full text-start">
            <thead className="bg-(--color-surface-2) text-sm text-(--color-ink-muted)">
              <tr className="text-start">
                {["Restaurant", "Status", "City", "Orders", "Users", "Till link", "Last sync"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-line)">
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-(--color-surface-2)">
                  <td className="px-4 py-3">
                    <button onClick={() => onOpen(r.id)} className="text-start font-medium underline-offset-2 hover:underline">{r.name}</button>
                    <div className="text-sm text-(--color-ink-muted)">/r/{r.slug}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">{r.city ?? "—"}</td>
                  <td className="px-4 py-3">{r._count.orders}</td>
                  <td className="px-4 py-3">{r._count.users}</td>
                  <td className="px-4 py-3"><PosBadge health={r.tpapi} /></td>
                  <td className="px-4 py-3 text-sm text-(--color-ink-muted)">{r.tpapi ? ago(r.tpapi.lastSyncAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {data.page} of {data.pages} · {data.total} restaurants</span>
          <button className={secondary} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </>
  );
}
