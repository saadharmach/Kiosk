"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCALES, clearCategoryImage, listCategories, setCategoryOrder, updateCategory, uploadCategoryImage,
  type AdminCategory, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "Anglais", ar: "Arabe" };

function Row({ slug, row, onSaved }: { slug: string; row: AdminCategory; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<I18n>(row.displayName ?? {});
  const [visible, setVisible] = useState(row.isVisible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The photo is saved the moment it is uploaded or removed, like a product's.
  const photo = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
    <li className="px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-(--color-line) bg-(--color-page)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {row.imageUrl ? <img src={row.imageUrl} alt="" className="size-full object-cover" /> : null}
        </span>
        {/* Phone: the name has the first line; the languages and the button go to a second one. */}
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
          <p className="flex items-center gap-2 font-bold">
            <span className="truncate">{row.displayName?.fr ?? row.posName}</span>
            {!row.isVisible ? <span className="badge badge-err">Masquée</span> : null}
          </p>
          <p className="truncate text-[12.5px] text-(--color-ink-muted)">unTill : {row.posName}</p>
        </div>
        <div className="flex w-full items-center gap-4 sm:w-auto">
        <div className="flex flex-1 gap-1 sm:flex-none">
          {LOCALES.map((l) => (
            <span key={l} className={`badge px-2 uppercase ${(row.displayName?.[l] ?? "").trim() ? "badge-info" : "badge-muted"}`}>{l}</span>
          ))}
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="btn btn-secondary btn-sm">
          {open ? "Fermer" : "Modifier"}
        </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-page) p-4">
          <div className="grid gap-3 md:grid-cols-3">
            {LOCALES.map((l) => (
              <div key={l}>
                <label className="field-label" htmlFor={`${row.untillId}-${l}`}>Nom · {LABEL[l]}</label>
                <input id={`${row.untillId}-${l}`} value={name[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
                  placeholder={row.posName}
                  onChange={(e) => setName({ ...name, [l]: e.target.value })} className="field" />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="field-label">Photo</p>
            <p className="mb-2 text-[12.5px] text-(--color-ink-muted)">
              Affichée à côté du nom dans la liste des catégories de la borne. Une photo carrée rend le mieux. Enregistrée dès l’envoi.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.imageUrl} alt="" className="size-20 rounded-(--radius-card) border border-(--color-line) object-cover" />
              ) : <span className="text-(--color-ink-muted)">Pas encore de photo</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} className="text-[13px]"
                aria-label={`Photo de ${row.posName}`}
                onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (file) void photo(() => uploadCategoryImage(slug, row.scope, row.untillId, file));
                }} />
              {row.imageUrl ? (
                <button type="button" disabled={busy} className="btn btn-ghost btn-sm text-(--color-danger)"
                  onClick={() => void photo(() => clearCategoryImage(slug, row.scope, row.untillId))}>
                  Retirer la photo
                </button>
              ) : null}
            </div>
            {error ? <p role="alert" className="note note-err mt-2">{error}</p> : null}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4 accent-(--color-brand)" />
              <span>Afficher sur la borne</span>
            </label>
            <button onClick={save} disabled={busy} className="btn btn-primary ms-auto">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Arranging the departments in the order the kiosk menu shows them: drag a row by its handle (mouse or finger), or use
 * the arrows; nothing changes on the kiosk until Save.
 */
function OrderEditor({ slug, rows, onDone }: {
  slug: string; rows: AdminCategory[];
  /** Called with the categories as saved (already in their new order), or null when cancelled. */
  onDone: (saved: { groups: AdminCategory[]; departments: AdminCategory[] } | null) => void;
}) {
  const [list, setList] = useState(rows);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const changed = list.some((r, i) => r.untillId !== rows[i]?.untillId);

  const move = (from: number, to: number) => setList((l) => {
    if (to < 0 || to >= l.length || from === to) return l;
    const next = [...l];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    return next;
  });

  // While dragging, the row goes where the finger or the pointer is: past the middle of a row, it takes that place.
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const from = list.findIndex((r) => r.untillId === dragging);
    // Its new place: how many of the other rows are above the pointer.
    const to = list.filter((r) => {
      if (r.untillId === dragging) return false;
      const box = items.current.get(r.untillId)?.getBoundingClientRect();
      return box ? box.top + box.height / 2 < e.clientY : false;
    }).length;
    move(from, to);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await setCategoryOrder(slug, list.map((r) => r.untillId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className="btn btn-primary">
          {busy ? "Enregistrement…" : "Enregistrer l’ordre"}
        </button>
        <button onClick={() => onDone(null)} disabled={busy} className="btn btn-secondary">Annuler</button>
        <button onClick={() => setList([...list].sort((a, b) => a.untillNumber - b.untillNumber || a.posName.localeCompare(b.posName)))}
          disabled={busy} className="btn btn-ghost">
          Ordre d’unTill
        </button>
        <span className="text-[12.5px] text-(--color-ink-muted)">Glissez une ligne par ⠿, ou utilisez les flèches. La borne change à l’enregistrement.</span>
      </div>
      {error ? <p role="alert" className="note note-err mb-3">{error}</p> : null}
      <ol className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)"
        onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
        {list.map((r, i) => (
          <li key={r.untillId} ref={(el) => { if (el) items.current.set(r.untillId, el); else items.current.delete(r.untillId); }}
            className={`flex items-center gap-3 p-2 ${dragging === r.untillId ? "bg-(--color-info-soft) shadow-md" : ""} ${r.isVisible ? "" : "opacity-60"}`}>
            <button type="button" aria-label={`Déplacer ${r.posName}`} title="Glisser pour déplacer"
              className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-xl text-(--color-ink-muted) select-none active:cursor-grabbing"
              onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(r.untillId); }}>
              ⠿
            </button>
            <span className="w-7 shrink-0 text-end text-sm text-(--color-ink-muted) tabular-nums">{i + 1}</span>
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-(--color-line) bg-(--color-page)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.imageUrl ? <img src={r.imageUrl} alt="" className="size-full object-cover" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.displayName?.fr ?? r.posName}</span>
              {!r.isVisible ? <span className="text-[12px] text-(--color-ink-muted)">masquée sur la borne</span> : null}
            </span>
            <button type="button" aria-label={`Monter ${r.posName}`} disabled={i === 0 || busy} onClick={() => move(i, i - 1)}
              className="btn btn-secondary btn-sm w-9">↑</button>
            <button type="button" aria-label={`Descendre ${r.posName}`} disabled={i === list.length - 1 || busy} onClick={() => move(i, i + 1)}
              className="btn btn-secondary btn-sm w-9">↓</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CategoriesPage({ slug }: { slug: string }) {
  const [data, setData] = useState<{ groups: AdminCategory[]; departments: AdminCategory[] } | null>(null);
  const load = useCallback(() => { listCategories(slug).then(setData).catch(() => undefined); }, [slug]);
  useEffect(load, [load]);
  const [ordering, setOrdering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!data) return <p className="text-(--color-ink-muted)">Chargement…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-(--color-ink-muted)">
            Les catégories listées à gauche du menu de la borne, dans cet ordre. Masquez-en une pour la cacher avec tous ses articles.
          </p>
          {!ordering ? (
            <button onClick={() => { setOrdering(true); setNotice(null); }} className="btn btn-secondary">Changer l’ordre</button>
          ) : null}
        </div>
        {notice ? <p role="status" className="note note-ok mb-3">{notice}</p> : null}
        {ordering ? (
          <OrderEditor slug={slug} rows={data.departments} onDone={(saved) => {
            // The answer to the save is the new list: shown at once, no second request to wait for.
            if (saved) { setData(saved); setNotice("Ordre enregistré. Les bornes l’affichent dans quelques secondes."); }
            setOrdering(false);
          }} />
        ) : (
          <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)">
            {data.departments.map((d) => <Row key={d.untillId} slug={slug} row={d} onSaved={load} />)}
          </ul>
        )}
      </section>
    </div>
  );
}