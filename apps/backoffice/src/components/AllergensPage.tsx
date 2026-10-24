"use client";

import { useEffect, useState } from "react";
import { listAllergens, type Allergen } from "@/lib/catalog";

export default function AllergensPage({ slug }: { slug: string }) {
  const [rows, setRows] = useState<Allergen[] | null>(null);
  useEffect(() => { listAllergens(slug).then(setRows).catch(() => setRows([])); }, [slug]);

  if (!rows) return <p className="text-(--color-ink-muted)">Chargement…</p>;
  if (rows.length === 0) {
    return <p className="card text-(--color-ink-muted)">Aucun allergène n’est configuré dans unTill pour ce restaurant.</p>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="note note-info">
        Les allergènes viennent d’unTill et ne se modifient pas ici. Attribuez-les aux articles depuis la fiche article.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Allergène</th><th>Description</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.untillId}>
                <td className="font-bold">{a.name}</td>
                <td className="text-(--color-ink-muted)">{a.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
