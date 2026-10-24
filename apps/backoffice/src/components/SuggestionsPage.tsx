"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listProducts, type AdminProduct } from "@/lib/catalog";
import {
  MAX_SUGGESTIONS, listSuggestions, moved, saveBasketSuggestions, saveSuggestions,
  type DepartmentSuggestions, type SuggestionItem,
} from "@/lib/suggestions";

const btn = "btn btn-secondary btn-sm min-w-8";

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

/** The key of the basket's own list, beside the departments' ids (which are numbers). */
const BASKET = "basket";

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

  const basket = dept.departmentId === BASKET;
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
      const ids = items.map((i) => i.articleId);
      await (basket ? saveBasketSuggestions(slug, ids) : saveSuggestions(slug, dept.departmentId, ids));
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
      {basket ? (
        <p className="note note-info">
          Sur l’écran <strong>Panier</strong>, sous « Vous aimerez aussi… », la borne propose ces articles, le premier d’abord,
          quel que soit le contenu du panier. Six au plus sont affichés, sans ceux déjà dans le panier. Liste vide : le panier
          propose les suggestions des catégories qu’il contient.
        </p>
      ) : (
        <p className="note note-info">
          Quand un client ajoute un article de <strong>{dept.name}</strong>, la borne propose ceux-ci, le premier d’abord. Quatre au
          plus sont affichés, sans ceux déjà dans sa commande.
        </p>
      )}

      <section aria-label="Articles suggérés" className="card">
        <h2 className="card-title">
          Suggérés <span className="text-[12.5px] font-normal text-(--color-ink-muted)">{items.length} / {MAX_SUGGESTIONS}</span>
        </h2>
        {items.length === 0 ? (
          <p className="rounded-(--radius-card) border border-dashed border-(--color-line) p-6 text-center text-(--color-ink-muted)">
            {basket
              ? "Rien de choisi : le panier propose les suggestions de ses catégories. Choisissez des articles ci-dessous pour proposer les vôtres."
              : "Rien n’est encore suggéré pour cette catégorie. Choisissez des articles ci-dessous."}
          </p>
        ) : (
          <ol className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {items.map((i, n) => (
              <li key={i.articleId} className="flex items-center gap-3 p-2">
                <span className="w-6 text-center text-[12.5px] text-(--color-ink-muted)">{n + 1}</span>
                <Photo src={i.imageUrl} className="size-11 shrink-0 rounded-md border border-(--color-line)" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.name}</span>
                  {!i.available ? <span className="badge badge-warn">absent d’unTill</span> : null}
                </span>
                <button className={btn} aria-label={`Monter ${i.name}`} disabled={n === 0} onClick={() => change(moved(items, n, -1))}>↑</button>
                <button className={btn} aria-label={`Descendre ${i.name}`} disabled={n === items.length - 1} onClick={() => change(moved(items, n, 1))}>↓</button>
                <button className={btn} aria-label={`Retirer ${i.name}`} onClick={() => change(items.filter((x) => x.articleId !== i.articleId))}>Retirer</button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Choisir des articles" className="card">
        <h2 className="card-title">Choisir des articles</h2>
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="pick-dept">Catégorie</label>
          <select id="pick-dept" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
            className="field w-full min-w-0 sm:w-auto sm:max-w-xs">
            <option value="">Toutes les catégories</option>
            {departments.map((d) => <option key={d.departmentId} value={d.departmentId}>{d.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="suggest-search">Rechercher un article</label>
          <input id="suggest-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom…"
            className="field min-w-0 flex-1 md:max-w-sm" />
        </div>

        {full ? <p className="note note-warn mb-2">La liste est pleine : retirez-en un pour en ajouter un autre.</p> : null}

        {found === null ? (
          <p className="text-(--color-ink-muted)">Chargement…</p>
        ) : choices.length === 0 ? (
          <p className="text-(--color-ink-muted)">Aucun article ne correspond.</p>
        ) : (
          <ul className="grid max-h-[26rem] grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 overflow-y-auto rounded-(--radius-card) border border-(--color-line) bg-(--color-page) p-3">
            {choices.map((p) => {
              const on = chosen.has(p.articleId);
              return (
                <li key={p.articleId}>
                  <button onClick={() => toggle(p)} aria-pressed={on} disabled={!on && full}
                    className={`relative flex h-full w-full flex-col overflow-hidden rounded-(--radius-card) border-2 bg-(--color-surface) text-start disabled:opacity-40 ${
                      on ? "border-(--color-brand)" : "border-(--color-line) hover:border-(--color-ink-muted)"
                    }`}>
                    <Photo src={p.imageUrl} className="aspect-4/3 w-full" />
                    <span className="flex flex-1 flex-col gap-0.5 p-2">
                      <span className="line-clamp-2 text-[13px] leading-snug font-semibold">{p.displayName?.fr ?? p.posName}</span>
                      <span className="truncate text-[12px] text-(--color-ink-muted)">{deptName(p.categoryId)}</span>
                    </span>
                    {on ? (
                      <span className="badge absolute end-2 top-2 bg-(--color-brand) text-(--color-brand-ink)">Ajouté ✓</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {found && found.total > PAGE ? (
          <p className="mt-2 text-[12.5px] text-(--color-ink-muted)">Les {PAGE} premiers sur {found.total}. Choisissez une catégorie ou cherchez pour affiner.</p>
        ) : null}
      </section>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={busy || !dirty} className="btn btn-primary">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        {dirty ? <button onClick={() => change(dept.suggestions)} className="btn btn-secondary">Annuler les modifications</button> : null}
        {dirty ? <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-(--color-warning)"><span className="dot dot-warn" />Modifications non enregistrées</span> : null}
        {savedAt && !dirty ? <span role="status" className="badge badge-ok">Enregistré</span> : null}
        {error ? <span role="alert" className="text-[13px] text-(--color-danger)">{error}</span> : null}
      </div>
    </div>
  );
}

export default function SuggestionsPage({ slug }: { slug: string }) {
  const [depts, setDepts] = useState<DepartmentSuggestions[] | null>(null);
  const [basket, setBasket] = useState<DepartmentSuggestions | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    listSuggestions(slug).then((r) => {
      setDepts(r.departments);
      // The basket's list is edited like a department's; it is listed first.
      setBasket({ departmentId: BASKET, posName: "Panier", name: "Panier", suggestions: r.basket ?? [] });
      setSelected((s) => s ?? BASKET);
    })
      .catch(() => setFailed(true));
  }, [slug]);
  useEffect(load, [load]);

  if (failed) return <p className="note note-err">Impossible de charger les suggestions.</p>;
  if (!depts) return <p className="text-(--color-ink-muted)">Chargement…</p>;
  const current = selected === BASKET ? basket : depts.find((d) => d.departmentId === selected);
  const count = (n: number) => (n > 0 ? ` (${n})` : "");

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8">
      {/* Phone: the departments are a drop-down above the editor. */}
      <label className="flex flex-col gap-1 md:hidden">
        <span className="field-label">Liste</span>
        <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} className="field">
          <option value={BASKET}>Écran Panier{count(basket?.suggestions.length ?? 0)}</option>
          <optgroup label="Après l’ajout d’un article de">
            {depts.map((d) => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.name}{count(d.suggestions.length)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <nav aria-label="Listes de suggestions" className="card hidden h-fit w-64 shrink-0 flex-col gap-0.5 p-2 md:flex">
        <button onClick={() => setSelected(BASKET)} aria-current={selected === BASKET ? "true" : undefined}
          className={`flex h-9 items-center justify-between gap-2 rounded-[7px] px-3 text-start font-semibold ${
            selected === BASKET ? "bg-(--color-info-soft) text-(--color-brand-deep)" : "hover:bg-(--color-page)"
          }`}>
          <span className="truncate">Écran Panier</span>
          {basket && basket.suggestions.length > 0 ? <span className="text-xs opacity-80">{basket.suggestions.length}</span> : null}
        </button>
        <p className="mt-3 mb-1 px-3 text-[11.5px] font-semibold text-(--color-ink-muted)">Après l’ajout d’un article de</p>
        {depts.map((d) => (
          <button key={d.departmentId} onClick={() => setSelected(d.departmentId)} aria-current={d.departmentId === selected ? "true" : undefined}
            className={`flex h-9 items-center justify-between gap-2 rounded-[7px] px-3 text-start ${
              d.departmentId === selected ? "bg-(--color-info-soft) font-semibold text-(--color-brand-deep)" : "hover:bg-(--color-page)"
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
