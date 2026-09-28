import { request } from "./api";

export type Locale = "fr" | "en" | "ar";
export const LOCALES: Locale[] = ["fr", "en", "ar"];
export type I18n = Partial<Record<Locale, string>>;

export interface AdminProduct {
  articleId: string;
  posName: string;
  categoryId: string | null;
  isMenu: boolean;
  displayName: I18n | null;
  description: I18n | null;
  imagePath: string | null;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  isFeatured: boolean;
  badgeText: string | null;
  allergenIds: string[];
  translatedInto: Locale[];
}

export interface ProductPage {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  products: AdminProduct[];
}

export interface AdminCategory {
  scope: "GROUP" | "DEPARTMENT";
  untillId: string;
  posName: string;
  displayName: I18n | null;
  isVisible: boolean;
  sortOrder: number;
}

const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");

export const listProducts = (slug: string, q: Record<string, string | undefined>) =>
  request<ProductPage>(`/restaurant/${slug}/catalog/products?${qs(q)}`);

export const updateProduct = (slug: string, articleId: string, body: unknown) =>
  request<unknown>(`/restaurant/${slug}/catalog/products/${articleId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const listCategories = (slug: string) =>
  request<{ groups: AdminCategory[]; departments: AdminCategory[] }>(
    `/restaurant/${slug}/catalog/categories`,
  );

export const signImage = (slug: string, articleId: string, contentType: string) =>
  request<{ uploadUrl: string; path: string; publicUrl: string }>(
    `/restaurant/${slug}/catalog/products/${articleId}/image/sign`,
    { method: "POST", body: JSON.stringify({ contentType }) },
  );

export const clearImage = (slug: string, articleId: string) =>
  request<{ imagePath: null }>(`/restaurant/${slug}/catalog/products/${articleId}/image`, {
    method: "DELETE",
  });

/** Sign, upload straight to storage, then record the path. */
export async function uploadProductImage(slug: string, articleId: string, file: File) {
  const { uploadUrl, path, publicUrl } = await signImage(slug, articleId, file.type);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed with ${res.status}`);
  await updateProduct(slug, articleId, { imagePath: path });
  return { path, publicUrl };
}
export interface Allergen {
  untillId: string;
  number: number;
  name: string;
  description: string | null;
}

export const listAllergens = (slug: string) =>
  request<Allergen[]>(`/restaurant/${slug}/catalog/allergens`);

export const setAllergens = (slug: string, articleId: string, allergenIds: string[]) =>
  request<{ allergenIds: string[] }>(
    `/restaurant/${slug}/catalog/products/${articleId}/allergens`,
    { method: "PUT", body: JSON.stringify({ allergenIds }) },
  );

export const updateCategory = (
  slug: string,
  scope: "GROUP" | "DEPARTMENT",
  untillId: string,
  body: unknown,
) =>
  request<unknown>(`/restaurant/${slug}/catalog/categories/${scope}/${untillId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });