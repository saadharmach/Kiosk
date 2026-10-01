"use client";

import { useEffect, useState } from "react";
import { listTillLog, type Page, type TillLogItem } from "@/lib/platform";
import { ErrorText, secondary, when } from "./ui";

export default function TillLogTab({ id }: { id: string }) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<TillLogItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTillLog(id, page, failuresOnly).then((d) => { if (!cancelled) { setData(d); setError(null); } }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [id, page, failuresOnly]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <p className="me-auto text-sm text-(--color-ink-muted)">Every conversation with this restaurant&apos;s till, newest first: reading the menu, sending orders, checking them.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={failuresOnly} onChange={(e) => { setFailuresOnly(e.target.checked); setPage(1); }} /> Only failures</label>
      </div>
      <ErrorText message={error} />
      {!data ? (error ? null : <p className="text-(--color-ink-muted)">Loading…</p>) : data.items.length === 0 ? (
        <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-8 text-center text-(--color-ink-muted)">{failuresOnly ? "No failures recorded." : "Nothing recorded yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
          <table className="w-full text-sm">
            <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["When", "Call", "Result", "Code", "Took", "Order", "Message"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-(--color-line)">
              {data.items.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-(--color-ink-muted)">{when(l.at)}</td>
                  <td className="px-4 py-2 font-medium">{l.operation ?? "—"}</td>
                  <td className={`px-4 py-2 font-medium ${l.ok ? "text-(--color-brand)" : "text-(--color-danger)"}`}>{l.ok ? "✓ ok" : "✗ failed"}</td>
                  <td className="px-4 py-2">{l.returnCode ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{l.durationMs === null ? "—" : `${l.durationMs} ms`}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{l.orderReference ?? ""}</td>
                  <td className="max-w-md px-4 py-2 text-(--color-ink-muted)">{l.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          <button className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className={secondary} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      ) : null}
    </div>
  );
}
