/** One advert on the welcome screen: a photo or a video, optionally showing a product from the menu. */
export interface WelcomeSlide { path: string; productId: string | null }

/** Reads the JSON column; anything malformed is dropped, never thrown. */
export function readSlides(raw: unknown): WelcomeSlide[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object" || typeof (x as { path?: unknown }).path !== "string") return [];
    const id = (x as { productId?: unknown }).productId;
    return [{ path: (x as { path: string }).path, productId: typeof id === "string" && /^\d{1,19}$/.test(id) ? id : null }];
  });
}
