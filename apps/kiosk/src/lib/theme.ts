/** Default accent, used when a restaurant sets none or sets something unusable. */
export const DEFAULT_BRAND = "#f59e0b";
const DARK_INK = "#0f172a";
const LIGHT_INK = "#ffffff";

/** Relative luminance (WCAG) of a 6-digit hex colour, 0 (black) to 1 (white). */
function luminanceOf(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const DARK_LUMINANCE = luminanceOf(DARK_INK.slice(1));

/**
 * Turns Restaurant.primaryColor into the two CSS variables the kiosk needs: the
 * accent and readable text on top of it. Only #rgb / #rrggbb is accepted; anything
 * else falls back to the default, so a bad value can never inject CSS.
 */
export function brandColors(input: string | null | undefined): { brand: string; ink: string } {
  const raw = (input ?? "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return brandColors(DEFAULT_BRAND);

  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");

  const brand = luminanceOf(hex);
  // Whichever of the two text colours reads better on this accent. A fixed cut-off picks the
  // worse one for mid-tones: at 0.3 some colours had only 3:1 contrast.
  const onDark = (brand + 0.05) / (DARK_LUMINANCE + 0.05);
  const onLight = (1 + 0.05) / (brand + 0.05);
  return { brand: `#${hex}`, ink: onDark >= onLight ? DARK_INK : LIGHT_INK };
}
