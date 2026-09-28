"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCALES, listCategories, updateCategory,
  type AdminCategory, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };

function Row({ slug, row, onSaved }: { slug: string; row: AdminCategory; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<I18n>(row.displayName ?? {});
  const [visible, setVisible] = useState(row.isVisible);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateCategory(slug, row.scope, row.untillId, { displayName: name, isVisible: visible });
      onSaved();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="p-3">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{row.displayName?.fr ?? row.posName}</p>
          <p className="truncate text-sm text-(--color-ink-muted)">{row.posName}</p>
        </div>
        <div className="flex gap-1">
          {LOCALES.map((l) => (
            <span key={l} className={`rounded px-1.5 py-0.5 text-xs uppercase ${
              (row.displayName?.[l] ?? "").trim()
                ? "bg-(--color-brand) text-(--color-brand-ink)"
                : "bg-(--color-surface-2) text-(--color-ink-muted)"
            }`}>{l}</span>
          ))}
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open}
          className="rounded-lg border border-(--color-line) px-4 py-2 text-sm">
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 rounded-lg bg-(--color-surface-2) p-4">
          <div className="grid gap-3 md:grid-cols-3">
            {LOCALES.map((l) => (
              <div key={l}>
                <label className="mb-1 block text-xs text-(--color-ink-muted)" htmlFor={`${row.untillId}-${l}`}>
                  {LABEL[l]}
                </label>
                <input id={`${row.untillId}-${l}`} value={name[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
                  placeholder={row.posName}
                  onChange={(e) => setName({ ...name, [l]: e.target.value })}
                  className="h-10 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              <span>Show on the kiosk</span>
            </label>
            <button onClick={save} disabled={busy}
              className="ms-auto h-10 rounded-lg bg-(--color-brand) px-5 text-sm font-medium text-(--color-brand-ink) disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function CategoriesPage({ slug }: { slug: string }) {
  const [data, setData] = useState<{ groups: AdminCategory[]; departments: AdminCategory[] } | null>(null);
  const load = useCallback(() => { listCategories(slug).then(setData).catch(() => undefined); }, [slug]);
  useEffect(load, [load]);

  if (!data) return <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-1 text-lg font-medium">Groups</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">The top row of tabs on the kiosk.</p>
        <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
          {data.groups.map((g) => <Row key={g.untillId} slug={slug} row={g} onSaved={load} />)}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Departments</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">
          The second row, inside the selected group. Which group a department belongs to is set in unTill and cannot be changed here.
        </p>
        <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
          {data.departments.map((d) => <Row key={d.untillId} slug={slug} row={d} onSaved={load} />)}
        </ul>
      </section>
    </div>
  );
}