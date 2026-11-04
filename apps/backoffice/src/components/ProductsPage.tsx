"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCALES, listCategories, listProducts, setProductsVisibility, updateProduct,
  type AdminCategory, type AdminProduct, type ProductPage } from "@/lib/catalog";
import ProductEditor from "./ProductEditor";

export default function ProductsPage({ slug }: { slug: string }) {
  const [data, setData] = useState<ProductPage | null>(null);
  const [departments, setDepartments] = useState<AdminCategory[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [missing, setMissing] = useState("");
  const [visibility, setVisibility] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await listProducts(slug, {
        search, categoryId, missing, visibility, page: String(page), pageSize: "50",
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, search, categoryId, missing, visibility, page]);

  /** Show all / Hide all: exactly the products listed with the current filters (every page). */
  const setAll = async (isVisible: boolean) => {
    if (!data) return;
    const what = data.total === 1 ? "cet article" : `ces ${data.total} articles`;
    if (!window.confirm(isVisible ? `Afficher ${what} sur la borne ?` : `Masquer ${what} de la borne ?`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { changed } = await setProductsVisibility(slug, {
        isVisible, search: search || undefined, categoryId: categoryId || undefined, missing: missing || undefined, visibility: visibility || undefined,
      });
      setNotice(`${changed} article${changed === 1 ? "" : "s"} ${isVisible ? "affiché" : "masqué"}${changed === 1 ? "" : "s"} sur la borne.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { listCategories(slug).then((c) => setDepartments(c.departments)).catch(() => undefined); }, [slug]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const toggleVisible = async (p: AdminProduct) => {
    await updateProduct(slug, p.articleId, { isVisible: !p.isVisible });
    load();
  };
  const categoryName = (id: string | null) => {
    const d = departments.find((x) => x.untillId === id);
    return d ? (d.displayName?.fr || d.posName) : "—";
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} type="search"
          placeholder="Rechercher un article…" aria-label="Rechercher un article"
          className="field min-w-52 flex-1" />
        <select value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}
          aria-label="Catégorie" className="field w-auto">
          <option value="">Toutes les catégories</option>
          {departments.map((d) => (
            <option key={d.untillId} value={d.untillId}>{d.displayName?.fr || d.posName}</option>
          ))}
        </select>
        <select value={missing} onChange={(e) => { setPage(1); setMissing(e.target.value); }}
          aria-label="Filtrer ce qui manque" className="field w-auto">
          <option value="">Tout</option>
          <option value="translation">Traduction manquante</option>
          <option value="image">Photo manquante</option>
        </select>
        <select value={visibility} onChange={(e) => { setPage(1); setVisibility(e.target.value); }}
          aria-label="Affichés ou masqués" className="field w-auto">
          <option value="">Affichés et masqués</option>
          <option value="shown">Affichés sur la borne</option>
          <option value="hidden">Masqués</option>
        </select>
      </div>

      <p className="note note-info">
        Les nouveaux articles venant d’unTill sont <b>masqués</b> au départ : choisissez ce que la borne affiche. « Tout afficher » et
        « Tout masquer » agissent sur les articles listés avec les filtres ci-dessus (toutes les pages).
      </p>

      {error ? <p role="alert" className="note note-err">{error}</p> : null}
      {notice ? <p role="status" className="note note-ok">{notice}</p> : null}

      {!data ? (
        <p className="text-(--color-ink-muted)">Chargement…</p>
      ) : data.products.length === 0 ? (
        <p className="card text-(--color-ink-muted)">Aucun article ne correspond à ces filtres.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button type="button" disabled={busy} onClick={() => void setAll(false)} className="btn btn-secondary">
              Tout masquer ({data.total})
            </button>
            <button type="button" disabled={busy} onClick={() => void setAll(true)} className="btn btn-primary">
              Tout afficher ({data.total})
            </button>
          </div>

          <div className="table-wrap">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-[60px]">Photo</th>
                  <th>Article</th>
                  <th>Catégorie</th>
                  <th>Langues</th>
                  <th>Borne</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.articleId}>
                    <td>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="size-11 rounded-md border border-(--color-line) object-cover" />
                      ) : (
                        <div className="size-11 rounded-md border border-(--color-line) bg-(--color-page)" />
                      )}
                    </td>
                    <td>
                      <p className="flex items-center gap-2 font-bold">
                        <span className="truncate">{p.displayName?.fr ?? p.posName}</span>
                        {p.isNew ? <span className="badge badge-info">Nouveau{p.newUntil ? ` jusqu’au ${p.newUntil}` : ""}</span> : null}
                      </p>
                      {p.displayName?.fr && p.displayName.fr !== p.posName ? (
                        <p className="truncate text-[12.5px] text-(--color-ink-muted)">unTill : {p.posName}</p>
                      ) : null}
                    </td>
                    <td className="text-(--color-ink-muted)">{categoryName(p.categoryId)}</td>
                    <td>
                      <span className="flex gap-1">
                        {LOCALES.map((l) => (
                          <span key={l} title={p.translatedInto.includes(l) ? "Traduit" : "Pas encore traduit"}
                            className={`badge px-2 uppercase ${p.translatedInto.includes(l) ? "badge-info" : "badge-muted"}`}>
                            {l}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => toggleVisible(p)} title={p.isVisible ? "Masquer de la borne" : "Afficher sur la borne"}
                        className={`badge cursor-pointer ${p.isVisible ? "badge-ok" : "badge-err"}`}>
                        {p.isVisible ? "Affiché" : "Masqué"}
                      </button>
                    </td>
                    <td className="text-end">
                      <button onClick={() => setEditing(p)} className="btn btn-secondary btn-sm">Modifier</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-(--color-line) px-3.5 py-2.5 text-[12.5px] text-(--color-ink-muted)">
              <span>{data.total} article{data.total === 1 ? "" : "s"}</span>
              <span className="flex items-center gap-2">
                {data.pages > 1 ? (
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-ghost btn-sm">Précédente</button>
                ) : null}
                Page {data.page} / {data.pages}
                {data.pages > 1 ? (
                  <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="btn btn-ghost btn-sm">Suivante</button>
                ) : null}
              </span>
            </div>
          </div>
        </>
      )}

      {editing ? (
        <ProductEditor slug={slug} product={editing} onClose={() => setEditing(null)} onSaved={load} />
      ) : null}
    </div>
  );
}
