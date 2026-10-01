"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listProducts, type AdminProduct } from "@/lib/catalog";
import {
  MAX_SUGGESTIONS, listSuggestions, moved, saveSuggestions,
  type DepartmentSuggestions, type SuggestionItem,
} from "@/lib/suggestions";

const btn = "h-9 min-w-9 rounded-lg border border-(--color-line) px-2 text-sm disabled:opacity-30";

/** A product photo that falls back to a plain tile when there is none, or it will not load. */
function Photo({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div aria-hidden className={`${className} bg-(--color-surface-2)`} />;
  // Decorative: the name beside it carries the meaning.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover`} />;
}

/** The most the chooser lists at once; a search or a department narrows it. */
const PAGE = 120;

function Editor({ slug, dept, departments, onSaved }: {
  slug: string; dept: DepartmentSuggestions; departments: DepartmentSuggestions[]; onSaved: () => void;
}) {
  const [items, setItems] = useState<SuggestionItem[]>(dept.suggestions);
  const [filterDept, setFilterDept] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ products: AdminProduct[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);
  const latest = useRef(0);

  const dirty = items.map((i) => i.articleId).join() !== dept.suggestions.map((i) => i.articleId).join();
  const full = items.length >= MAX_SUGGESTIONS;
  const chosen = new Set(items.map((i) => i.articleId));
  const deptName = (id: string | null) => departments.find((d) => d.departmentId === id)?.name ?? "";

  // Always a list to choose from; typing or picking a department only narrows it. The newest
  // request wins, so a slow answer can never overwrite a later one.
  useEffect(() => {
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      listProducts(slug, { categoryId: filterDept, search: search.trim(), pageSize: String(PAGE) })
        .then((p) => mine === latest.current && setFound({ products: p.products, total: p.total }))
        .catch(() => mine === latest.current && setFound({ products: [], total: 0 }));
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [slug, filterDept, search]);

  const change = (next: SuggestionItem[]) => { setItems(next); setSavedAt(false); };
  const toggle = (p: AdminProduct) =>
    change(
      chosen.has(p.articleId)
        ? items.filter((i) => i.articleId !== p.articleId)
        : full ? items
        : [...items, { articleId: p.articleId, name: p.displayName?.fr ?? p.posName, imageUrl: p.imageUrl, categoryId: p.categoryId, available: true }],
    );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveSuggestions(slug, dept.departmentId, items.map((i) => i.articleId));
      setSavedAt(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choices = (found?.products ?? []).filter((p) => !p.isMenu);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-(--color-ink-muted)">
        When a customer adds something from <strong>{dept.name}</strong>, the kiosk offers these, first one first. Up to four are
        shown, skipping anything already in their order.
      </p>

      <section aria-label="Suggested products">
        <h2 className="mb-2 text-lg font-medium">
          Suggested <span className="text-sm font-normal text-(--color-ink-muted)">{items.length} / {MAX_SUGGESTIONS}</span>
        </h2>
        {items.length === 0 ? (
          <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-6 text-center text-(--color-ink-muted)">
            Nothing is suggested for this department yet. Choose products below.
          </p>
        ) : (
          <ol className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {items.map((i, n) => (
              <li key={i.articleId} className="flex items-center gap-3 p-2">
                <span className="w-6 text-center text-sm text-(--color-ink-muted)">{n + 1}</span>
                <Photo src={i.imageUrl} className="size-14 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{i.name}</span>
                  {!i.available ? <span className="rounded bg-(--color-surface-2) px-1.5 py-0.5 text-xs text-(--color-ink-muted)">not in unTill</span> : null}
                </span>
                <button className={btn} aria-label={`Move ${i.name} up`} disabled={n === 0} onClick={() => change(moved(items, n, -1))}>↑</button>
                <button className={btn} aria-label={`Move ${i.name} down`} disabled={n === items.length - 1} onClick={() => change(moved(items, n, 1))}>↓</button>
                <button className={btn} aria-label={`Remove ${i.name}`} onClick={() => change(items.filter((x) => x.articleId !== i.articleId))}>Remove</button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Choose products">
        <h2 className="mb-2 text-lg font-medium">Choose products</h2>
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="pick-dept">Department</label>
          <select id="pick-dept" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
            className="h-10 rounded-lg border border-(--color-line) bg-(--color-surface) px-3">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="suggest-search">Search products</label>
          <input id="suggest-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name"
            className="h-10 min-w-0 flex-1 rounded-lg border border-(--color-line) bg-(--color-surface) px-3 md:max-w-sm" />
        </div>

        {full ? <p className="mb-2 text-sm text-(--color-ink-muted)">The list is full: remove one to add another.</p> : null}

        {found === null ? (
          <p className="text-(--color-ink-muted)">Loading…</p>
        ) : choices.length === 0 ? (
          <p className="text-(--color-ink-muted)">No product matches.</p>
        ) : (
          <ul className="grid max-h-[26rem] grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 overflow-y-auto rounded-(--radius-card) border border-(--color-line) p-3">
            {choices.map((p) => {
              const on = chosen.has(p.articleId);
              return (
                <li key={p.articleId}>
                  <button onClick={() => toggle(p)} aria-pressed={on} disabled={!on && full}
                    className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 text-start disabled:opacity-40 ${
                      on ? "border-(--color-brand)" : "border-(--color-line) hover:border-(--color-ink-muted)"
                    }`}>
                    <Photo src={p.imageUrl} className="aspect-4/3 w-full" />
                    <span className="flex flex-1 flex-col gap-0.5 p-2">
                      <span className="line-clamp-2 text-sm leading-snug font-medium">{p.displayName?.fr ?? p.posName}</span>
                      <span className="truncate text-xs text-(--color-ink-muted)">{deptName(p.categoryId)}</span>
                    </span>
                    {on ? (
                      <span className="absolute end-2 top-2 rounded-full bg-(--color-brand) px-2 py-0.5 text-xs font-medium text-(--color-brand-ink)">Added ✓</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {found && found.total > PAGE ? (
          <p className="mt-2 text-sm text-(--color-ink-muted)">Showing the first {PAGE} of {found.total}. Pick a department or search to narrow it.</p>
        ) : null}
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={busy || !dirty}
          className="h-10 rounded-lg bg-(--color-brand) px-5 text-sm font-medium text-(--color-brand-ink) disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        {dirty ? <button onClick={() => change(dept.suggestions)} className="text-sm underline">Discard changes</button> : null}
        {savedAt && !dirty ? <span role="status" className="text-sm text-(--color-ink-muted)">Saved</span> : null}
        {error ? <span role="alert" className="text-sm text-(--color-danger)">{error}</span> : null}
      </div>
    </div>
  );
}

export default function SuggestionsPage({ slug }: { slug: string }) {
  const [depts, setDepts] = useState<DepartmentSuggestions[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    listSuggestions(slug).then((r) => { setDepts(r.departments); setSelected((s) => s ?? r.departments[0]?.departmentId ?? null); })
      .catch(() => setFailed(true));
  }, [slug]);
  useEffect(load, [load]);

  if (failed) return <p className="text-(--color-danger)">Could not load the suggestions.</p>;
  if (!depts) return <p className="text-(--color-ink-muted)">Loading…</p>;
  const current = depts.find((d) => d.departmentId === selected);

  return (
    <div className="flex gap-8">
      <nav aria-label="Departments" className="flex w-64 shrink-0 flex-col gap-1">
        {depts.map((d) => (
          <button key={d.departmentId} onClick={() => setSelected(d.departmentId)} aria-current={d.departmentId === selected ? "true" : undefined}
            className={`flex h-10 items-center justify-between gap-2 rounded-lg px-3 text-start ${
              d.departmentId === selected ? "bg-(--color-brand) text-(--color-brand-ink)" : "hover:bg-(--color-surface-2)"
            }`}>
            <span className="truncate">{d.name}</span>
            {d.suggestions.length > 0 ? <span className="text-xs opacity-80">{d.suggestions.length}</span> : null}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {/* key: switching department starts a fresh editor with that department's own list */}
        {current ? <Editor key={current.departmentId} slug={slug} dept={current} departments={depts} onSaved={load} /> : null}
      </div>
    </div>
  );
}
