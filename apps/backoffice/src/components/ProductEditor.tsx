"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOCALES, clearImage, updateProduct, uploadProductImage,
  type AdminProduct, type I18n, type Locale,listAllergens, setAllergens,
  type Allergen
} from "@/lib/catalog";

const LABEL: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div ref={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={product.posName}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-s border-(--color-line) bg-(--color-surface) p-6">
        <header className="mb-6">
          <p className="text-sm text-(--color-ink-muted)">unTill name</p>
          <h2 className="text-xl font-semibold">{product.posName}</h2>
        </header>

        {LOCALES.map((l) => (
          <div key={l} className="mb-4">
            <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor={`n-${l}`}>
              Name · {LABEL[l]}
            </label>
            <input id={`n-${l}`} value={name[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
              placeholder={product.posName}
              onChange={(e) => setName({ ...name, [l]: e.target.value })}
              className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3" />
          </div>
        ))}

        {LOCALES.map((l) => (
          <div key={l} className="mb-4">
            <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor={`d-${l}`}>
              Description · {LABEL[l]}
            </label>
            <textarea id={`d-${l}`} rows={2} value={desc[l] ?? ""} dir={l === "ar" ? "rtl" : "ltr"}
              onChange={(e) => setDesc({ ...desc, [l]: e.target.value })}
              className="w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) p-3" />
          </div>
        ))}

        <div className="mb-6">
          <p className="mb-2 text-sm text-(--color-ink-muted)">Image</p>
          {imageUrl ? (
            <div className="mb-3 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="size-24 rounded-lg object-cover" />
              <button onClick={removeImage} disabled={busy} className="text-sm text-(--color-danger) underline">
                Remove image
              </button>
            </div>
          ) : (
            <p className="mb-3 text-sm text-(--color-ink-muted)">No image yet</p>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy}
            onChange={(e) => pickImage(e.target.files?.[0])} className="text-sm" />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="sort">Sort order</label>
            <input id="sort" inputMode="numeric" value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))}
              className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-(--color-ink-muted)" htmlFor="badge">Badge</label>
            <input id="badge" value={badge} maxLength={40}
              onChange={(e) => setBadge(e.target.value)}
              className="h-11 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3" />
          </div>
        </div>

        <label className="mb-2 flex items-center gap-3">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>Show on the kiosk</span>
        </label>
        <label className="mb-6 flex items-center gap-3">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          <span>Featured</span>
        </label>
        {allergens.length > 0 ? (
          <fieldset className="mb-6">
            <legend className="mb-2 text-sm text-(--color-ink-muted)">Allergens</legend>
            <div className="grid grid-cols-2 gap-2">
              {allergens.map((a) => (
                <label key={a.untillId} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={chosen.has(a.untillId)}
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
        {error ? <p className="mb-4 text-sm text-(--color-danger)">{error}</p> : null}

        <div className="mt-auto flex gap-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-lg border border-(--color-line)">Cancel</button>
          <button onClick={save} disabled={busy}
            className="h-11 flex-1 rounded-lg bg-(--color-brand) font-medium text-(--color-brand-ink) disabled:opacity-50">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}