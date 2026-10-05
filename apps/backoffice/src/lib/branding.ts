import { request } from "./api";
import type { I18n } from "./catalog";

export interface Branding {
  logoPath: string | null;
  logoUrl: string | null;
  /** Welcome-screen photos (offers, adverts) in the order the kiosk shows them. */
  welcomeImages: { path: string; url: string | null }[];
  tagline: I18n;
  primaryColor: string | null;
}

export const MAX_WELCOME_IMAGES = 5;
export const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif";

export const getBranding = (slug: string) => request<Branding>(`/restaurant/${slug}/branding`);

export const updateBranding = (
  slug: string,
  body: { logoPath?: string | null; welcomeImagePaths?: string[]; tagline?: I18n | null },
) => request<Branding>(`/restaurant/${slug}/branding`, { method: "PATCH", body: JSON.stringify(body) });

/** Sign, then upload straight to storage. Returns the path to save; nothing is recorded until it is saved. */
export async function uploadBrandingImage(slug: string, kind: "logo" | "welcome", file: File): Promise<string> {
  const { uploadUrl, path } = await request<{ uploadUrl: string; path: string }>(
    `/restaurant/${slug}/branding/${kind}/sign`,
    { method: "POST", body: JSON.stringify({ contentType: file.type }) },
  );
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error(`Upload failed with ${res.status}`);
  return path;
}
