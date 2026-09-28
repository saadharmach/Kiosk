"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCALES, listCategories, listProducts, updateProduct,
  type AdminCategory, type AdminProduct, type ProductPage } from "@/lib/catalog";
import ProductEditor from "./ProductEditor";

export default function ProductsPage({ slug }: { slug: string }) {
  const [data, setData] = useState<ProductPage | null>(null);
  const [departments, setDepartments] = useState<AdminCategory[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [missing, setMissing] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await listProducts(slug, {
        search, categoryId, missing, page: String(page), pageSize: "50",
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, search, categoryId, missing, page]);

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search products" aria-label="Search products"
          className="h-10 min-w-64 flex-1 rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3" />
        <select value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}
          aria-label="Category"
          className="h-10 rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3">
          <option value="">All categories</option>
          {departments.map((d) => (
            <option key={d.untillId} value={d.untillId}>{d.posName}</option>
          ))}
        </select>
        <select value={missing} onChange={(e) => { setPage(1); setMissing(e.target.value); }}
          aria-label="Filter by what is missing"
          className="h-10 rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3">
          <option value="">Everything</option>
          <option value="translation">Missing a translation</option>
          <option value="image">Missing an image</option>
        </select>
      </div>

      {error ? <p className="mb-4 text-(--color-danger)">{error}</p> : null}

      {!data ? (
        <p className="text-(--color-ink-muted)">Loading…</p>
      ) : data.products.length === 0 ? (
        <p className="text-(--color-ink-muted)">Nothing matches those filters.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-(--color-ink-muted)">
            {data.total} product{data.total === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
            {data.products.map((p) => (
              <li key={p.articleId} className="flex items-center gap-4 p-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="size-12 rounded object-cover" />
                ) : (
                  <div className="size-12 rounded bg-(--color-surface-2)" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.displayName?.fr ?? p.posName}</p>
                  <p className="truncate text-sm text-(--color-ink-muted)">{p.posName}</p>
                </div>

                <div className="flex gap-1">
                  {LOCALES.map((l) => (
                    <span key={l}
                      className={`rounded px-1.5 py-0.5 text-xs uppercase ${
                        p.translatedInto.includes(l)
                          ? "bg-(--color-brand) text-(--color-brand-ink)"
                          : "bg-(--color-surface-2) text-(--color-ink-muted)"
                      }`}>
                      {l}
                    </span>
                  ))}
                </div>

                <button onClick={() => toggleVisible(p)}
                  className={`w-24 rounded-lg border px-2 py-1 text-sm ${
                    p.isVisible ? "border-(--color-line)" : "border-(--color-danger) text-(--color-danger)"
                  }`}>
                  {p.isVisible ? "Visible" : "Hidden"}
                </button>

                <button onClick={() => setEditing(p)}
                  className="rounded-lg bg-(--color-brand) px-4 py-2 text-sm font-medium text-(--color-brand-ink)">
                  Edit
                </button>
              </li>
            ))}
          </ul>

          {data.pages > 1 ? (
            <div className="mt-4 flex items-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="h-10 rounded-lg border border-(--color-line) px-4 disabled:opacity-40">Previous</button>
              <span className="text-sm text-(--color-ink-muted)">Page {data.page} of {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}
                className="h-10 rounded-lg border border-(--color-line) px-4 disabled:opacity-40">Next</button>
            </div>
          ) : null}
        </>
      )}

      {editing ? (
        <ProductEditor slug={slug} product={editing} onClose={() => setEditing(null)} onSaved={load} />
      ) : null}
    </div>
  );
}