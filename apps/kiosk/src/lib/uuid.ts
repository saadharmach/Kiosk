/**
 * A random id (UUID v4). `crypto.randomUUID` only exists on secure pages (https or localhost), and a kiosk opened
 * by the PC's address on the local network (http://192.168.x.x) is not one: calling it there crashes the screen.
 * `getRandomValues` works everywhere, so it is the fallback.
 */
export function newId(c: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
