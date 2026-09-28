"use client";

import { useEffect, useState } from "react";
import { listAllergens, type Allergen } from "@/lib/catalog";

export default function AllergensPage({ slug }: { slug: string }) {
  const [rows, setRows] = useState<Allergen[] | null>(null);
  useEffect(() => { listAllergens(slug).then(setRows).catch(() => setRows([])); }, [slug]);

  if (!rows) return <p className="text-(--color-ink-muted)">Loading…</p>;
  if (rows.length === 0) {
    return <p className="text-(--color-ink-muted)">No allergens are configured in unTill for this restaurant.</p>;
  }

  return (
    <>
      <p className="mb-4 text-sm text-(--color-ink-muted)">
        Allergens come from unTill and are read-only here. Assign them to products from the product editor.
      </p>
      <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
        {rows.map((a) => (
          <li key={a.untillId} className="p-3">
            <p className="font-medium">{a.name}</p>
            {a.description ? <p className="text-sm text-(--color-ink-muted)">{a.description}</p> : null}
          </li>
        ))}
      </ul>
    </>
  );
}