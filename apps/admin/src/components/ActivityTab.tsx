"use client";

import { useEffect, useState } from "react";
import { listActivity, type ActivityItem, type Page } from "@/lib/platform";
import { ErrorText, secondary, when } from "./ui";

/** "restaurant_user.password_reset" → "restaurant user: password reset" */
const readable = (action: string) => {
  const [what, ...rest] = action.split(".");
  return `${(what ?? "").replace(/_/g, " ")}${rest.length ? `: ${rest.join(" ").replace(/_/g, " ")}` : ""}`;
};

export default function ActivityTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ActivityItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listActivity(id, page).then(setData).catch((e) => setError((e as Error).message)); }, [id, page]);

  if (!data) return <><ErrorText message={error} />{!error ? <p className="text-(--color-ink-muted)">Loading…</p> : null}</>;
  if (data.items.length === 0) return <p className="text-(--color-ink-muted)">Nothing has been recorded for this restaurant yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-ink-muted)">Who changed what. The data itself is not shown here.</p>
      <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-line)">
        <table className="w-full text-sm">
          <thead className="bg-(--color-surface-2) text-(--color-ink-muted)"><tr>{["When", "Who", "What"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-(--color-line)">
            {data.items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2 whitespace-nowrap text-(--color-ink-muted)">{when(i.at)}</td>
                <td className="px-4 py-2">{i.actor ?? "unknown"}</td>
                <td className="px-4 py-2">{readable(i.action)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.pages > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          <button className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className={secondary} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      ) : null}
    </div>
  );
}
