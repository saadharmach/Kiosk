"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCALES, clearCategoryImage, listCategories, setCategoryOrder, updateCategory, uploadCategoryImage,
  type AdminCategory, type I18n, type Locale } from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };

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
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-(--color-surface-2)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {row.imageUrl ? <img src={row.imageUrl} alt="" className="size-full object-cover" /> : null}
        </span>
        {/* Phone: the name has the first line; the languages and the button go to a second one. */}
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
          <p className="truncate font-medium">{row.displayName?.fr ?? row.posName}</p>
          <p className="truncate text-sm text-(--color-ink-muted)">{row.posName}</p>
        </div>
        <div className="flex w-full items-center gap-4 sm:w-auto">
        <div className="flex flex-1 gap-1 sm:flex-none">
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
          <div className="mt-4">
            <p className="mb-2 text-xs text-(--color-ink-muted)">
              Photo, shown beside the name in the kiosk&apos;s category list. A square photo works best. Saved as soon as it is uploaded.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.imageUrl} alt="" className="size-20 rounded-lg object-cover" />
              ) : <span className="text-sm text-(--color-ink-muted)">No photo yet</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} className="text-sm"
                aria-label={`Photo for ${row.posName}`}
                onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (file) void photo(() => uploadCategoryImage(slug, row.scope, row.untillId, file));
                }} />
              {row.imageUrl ? (
                <button type="button" disabled={busy} className="text-sm text-(--color-danger) underline"
                  onClick={() => void photo(() => clearCategoryImage(slug, row.scope, row.untillId))}>
                  Remove photo
                </button>
              ) : null}
            </div>
            {error ? <p role="alert" className="mt-2 text-sm text-(--color-danger)">{error}</p> : null}
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
        <button onClick={save} disabled={busy || !changed}
          className="h-10 rounded-lg bg-(--color-brand) px-5 text-sm font-medium text-(--color-brand-ink) disabled:opacity-50">
          {busy ? "Saving…" : "Save order"}
        </button>
        <button onClick={() => onDone(null)} disabled={busy} className="h-10 rounded-lg border border-(--color-line) px-4 text-sm">Cancel</button>
        <button onClick={() => setList([...list].sort((a, b) => a.untillNumber - b.untillNumber || a.posName.localeCompare(b.posName)))}
          disabled={busy} className="h-10 rounded-lg border border-(--color-line) px-4 text-sm">
          unTill&apos;s order
        </button>
        <span className="text-sm text-(--color-ink-muted)">Drag a row by ⠿, or use the arrows. The kiosk changes when you save.</span>
      </div>
      {error ? <p role="alert" className="mb-3 text-sm text-(--color-danger)">{error}</p> : null}
      <ol className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)"
        onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
        {list.map((r, i) => (
          <li key={r.untillId} ref={(el) => { if (el) items.current.set(r.untillId, el); else items.current.delete(r.untillId); }}
            className={`flex items-center gap-3 p-2 ${dragging === r.untillId ? "bg-(--color-surface-2) shadow-md" : ""} ${r.isVisible ? "" : "opacity-60"}`}>
            <button type="button" aria-label={`Drag ${r.posName}`} title="Drag to move"
              className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-xl text-(--color-ink-muted) select-none active:cursor-grabbing"
              onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(r.untillId); }}>
              ⠿
            </button>
            <span className="w-7 shrink-0 text-end text-sm text-(--color-ink-muted) tabular-nums">{i + 1}</span>
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-(--color-surface-2)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.imageUrl ? <img src={r.imageUrl} alt="" className="size-full object-cover" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.displayName?.fr ?? r.posName}</span>
              {!r.isVisible ? <span className="text-xs text-(--color-ink-muted)">hidden on the kiosk</span> : null}
            </span>
            <button type="button" aria-label={`Move ${r.posName} up`} disabled={i === 0 || busy} onClick={() => move(i, i - 1)}
              className="h-10 w-10 shrink-0 rounded-lg border border-(--color-line) disabled:opacity-30">↑</button>
            <button type="button" aria-label={`Move ${r.posName} down`} disabled={i === list.length - 1 || busy} onClick={() => move(i, i + 1)}
              className="h-10 w-10 shrink-0 rounded-lg border border-(--color-line) disabled:opacity-30">↓</button>
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

  if (!data) return <p className="text-(--color-ink-muted)">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Departments</h2>
          {!ordering ? (
            <button onClick={() => { setOrdering(true); setNotice(null); }} className="h-10 rounded-lg border border-(--color-line) px-4 text-sm">
              Change order
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-sm text-(--color-ink-muted)">
          The categories listed on the left of the kiosk menu, in this order. Switch one off to hide it and all its products.
        </p>
        {notice ? <p role="status" className="mb-3 text-sm text-green-700">{notice}</p> : null}
        {ordering ? (
          <OrderEditor slug={slug} rows={data.departments} onDone={(saved) => {
            // The answer to the save is the new list: shown at once, no second request to wait for.
            if (saved) { setData(saved); setNotice("Order saved. The kiosks show it within a few seconds."); }
            setOrdering(false);
          }} />
        ) : (
          <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {data.departments.map((d) => <Row key={d.untillId} slug={slug} row={d} onSaved={load} />)}
          </ul>
        )}
      </section>
    </div>
  );
}