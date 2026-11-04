export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

/** The first candidate that is a supported language, else French. */
export function resolveLocale(...candidates: unknown[]): Locale {
  return candidates.find(isLocale) ?? "fr";
}

/**
 * Resolves one language out of a { fr, en, ar } column. Falls through the other
 * languages before the fallback, so a half-translated menu still renders real
 * text instead of blanks: a missing Arabic name shows French, not nothing.
 */
export function pickLocalized(value: unknown, locale: Locale, fallback: string | null): string | null {
  if (value == null) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value !== "object" || Array.isArray(value)) return fallback;
  const map = value as Record<string, unknown>;
  for (const l of [locale, ...LOCALES.filter((x) => x !== locale)]) {
    const v = map[l];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}

/** A stored { fr, en, ar } value reduced to the languages that actually have text. */
export function readLocalizedMap(value: unknown): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const map = value as Record<string, unknown>;
  for (const l of LOCALES) {
    const v = map[l];
    if (typeof v === "string" && v.trim()) out[l] = v.trim();
  }
  return out;
}
