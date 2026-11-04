import { request } from "./api";
import type { I18n } from "./catalog";

/** One advert on the kiosk's welcome screen. */
export interface Slide {
  path: string;
  url: string | null;
  kind: "image" | "video";
  /** The product shown on the slide (its menu price is shown with it), if any. */
  productId: string | null;
  productName: string | null;
}

export interface Branding {
  logoPath: string | null;
  logoUrl: string | null;
  /** Welcome-screen adverts in the order the kiosk shows them. */
  welcomeSlides: Slide[];
  tagline: I18n;
  subtitle: I18n;
  primaryColor: string | null;
}

export const MAX_WELCOME_SLIDES = 5;
export const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif";
export const SLIDE_TYPES = `${IMAGE_TYPES},video/mp4,video/webm`;

export const getBranding = (slug: string) => request<Branding>(`/restaurant/${slug}/branding`);

export const updateBranding = (
  slug: string,
  body: {
    logoPath?: string | null;
    welcomeSlides?: { path: string; productId?: string | null }[];
    tagline?: I18n | null;
    subtitle?: I18n | null;
  },
) => request<Branding>(`/restaurant/${slug}/branding`, { method: "PATCH", body: JSON.stringify(body) });

/** The list as the API wants it back. */
export const slidesBody = (slides: Slide[]) => slides.map(({ path, productId }) => ({ path, productId }));

/** Sign, then upload straight to storage. Returns the path to save; nothing is recorded until it is saved. */
export async function uploadBrandingImage(slug: string, kind: "logo" | "welcome", file: File): Promise<string> {
  const { uploadUrl, path } = await request<{ uploadUrl: string; path: string }>(
    `/restaurant/${slug}/branding/${kind}/sign`,
    { method: "POST", body: JSON.stringify({ contentType: file.type }) },
  );
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Upload failed with ${res.status}`);
  }
  return path;
}
