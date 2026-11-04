"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOCALES, clearImage, updateProduct, uploadProductImage,
  type AdminProduct, type I18n, type Locale,listAllergens, setAllergens,
  type Allergen
} from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "Anglais", ar: "Arabe" };

export default function ProductEditor({
  slug, product, onClose, onSaved,
}: {
  slug: string;
  product: AdminProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState<I18n>(product.displayName ?? {});
  const [desc, setDesc] = useState<I18n>(product.description ?? {});
  const [visible, setVisible] = useState(product.isVisible);
  const [featured, setFeatured] = useState(product.isFeatured);
  const [badge, setBadge] = useState(product.badgeText ?? "");
  const [isNew, setIsNew] = useState(product.isNew);
  const [newUntil, setNewUntil] = useState(product.newUntil ?? "");
  const [sortOrder, setSortOrder] = useState(String(product.sortOrder));
  const [imageUrl, setImageUrl] = useState(product.imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [allergens, setAllergens_] = useState<Allergen[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set(product.allergenIds));

  useEffect(() => {
    listAllergens(slug).then(setAllergens_).catch(() => undefined);
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector("input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProduct(slug, product.articleId, {
        displayName: name,
        description: desc,
        isVisible: visible,
        isFeatured: featured,
        badgeText: badge,
        isNew,
        newUntil: isNew ? newUntil || null : null,
        sortOrder: Number(sortOrder) || 0,
      });
      const before = [...product.allergenIds].sort().join(",");
      const after = [...chosen].sort().join(",");
      if (before !== after) await setAllergens(slug, product.articleId, [...chosen]);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { publicUrl } = await uploadProductImage(slug, product.articleId, file);
      setImageUrl(publicUrl);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      await clearImage(slug, product.articleId);
      setImageUrl(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,16,28,0.5)]" onClick={onClose}>
      <div ref={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={product.posName}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-s border-(--color-line) bg-(--color-surface)">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-(--color-line) bg-(--color-surface) px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-(--color-ink-muted)">Catalogue / Articles · nom dans unTill</p>
            <h2 className="truncate text-[19px] font-bold">{product.posName}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="btn btn-ghost btn-sm">✕</button>
        </header>

        <div className="flex flex-col gap-5 p-5">
          <section className="flex flex-col gap-3">
            <h3 className="card-title mb-0">Nom affiché sur la borne</h3>
            {LOCALES.map((l) => (
              <div key={l}>
                <label className="field-label" htmlFor={`n-${l}`}>Nom · {LABEL[l]}</label>
                <input id={`n-${l}`} value={name[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
                  placeholder={product.posName}
                  onChange={(e) => setName({ ...name, [l]: e.target.value })} className="field" />
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="card-title mb-0">Description</h3>
            {LOCALES.map((l) => (
              <div key={l}>
                <label className="field-label" htmlFor={`d-${l}`}>Description · {LABEL[l]}</label>
                <textarea id={`d-${l}`} rows={2} value={desc[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
                  onChange={(e) => setDesc({ ...desc, [l]: e.target.value })} className="field" />
              </div>
            ))}
          </section>

          <section>
            <h3 className="card-title">Photo</h3>
            {imageUrl ? (
              <div className="mb-3 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="size-24 rounded-(--radius-card) border border-(--color-line) object-cover" />
                <button onClick={removeImage} disabled={busy} className="btn btn-ghost btn-sm text-(--color-danger)">
                  Retirer la photo
                </button>
              </div>
            ) : (
              <p className="mb-3 text-(--color-ink-muted)">Pas encore de photo.</p>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy}
              onChange={(e) => pickImage(e.target.files?.[0])} className="text-[13px]" />
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="sort">Ordre</label>
              <input id="sort" inputMode="numeric" value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))} className="field" />
            </div>
            <div>
              <label className="field-label" htmlFor="badge">Badge</label>
              <input id="badge" value={badge} maxLength={40} onChange={(e) => setBadge(e.target.value)} className="field" />
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4 accent-(--color-brand)" />
              <span>Afficher sur la borne</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="size-4 accent-(--color-brand)" />
              <span>Mis en avant</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="size-4 accent-(--color-brand)" />
              <span>Nouveau — la borne affiche un ruban « Nouveau » sur l’article</span>
            </label>
            {isNew ? (
              <div className="ms-7">
                <label className="field-label" htmlFor="new-until">Dernier jour en nouveauté</label>
                <div className="flex items-center gap-2">
                  <input id="new-until" type="date" value={newUntil} onChange={(e) => setNewUntil(e.target.value)} className="field w-auto" />
                  {newUntil ? (
                    <button type="button" onClick={() => setNewUntil("")} className="btn btn-secondary">Effacer</button>
                  ) : null}
                </div>
                <span className="field-hint">Facultatif : laissez vide pour le garder jusqu’à ce que vous décochiez.</span>
              </div>
            ) : null}
          </section>

          {allergens.length > 0 ? (
            <fieldset>
              <legend className="card-title">Allergènes</legend>
              <div className="grid grid-cols-2 gap-2">
                {allergens.map((a) => (
                  <label key={a.untillId} className="flex items-center gap-2">
                    <input type="checkbox" checked={chosen.has(a.untillId)} className="size-4 accent-(--color-brand)"
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(a.untillId); else next.delete(a.untillId);
                        setChosen(next);
                      }} />
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {error ? <p role="alert" className="note note-err">{error}</p> : null}
        </div>

        <footer className="sticky bottom-0 mt-auto flex gap-2.5 border-t border-(--color-line) bg-(--color-surface) px-5 py-3.5">
          <button onClick={onClose} className="btn btn-secondary flex-1">Annuler</button>
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </div>
    </div>
  );
}
