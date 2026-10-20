import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { normalizePairingCode } from "../printing/printing.service.js";
import { resolveBorne, unavailable } from "./availability.js";

/** The kiosk recognises this code and shows its "register this screen" page. */
export const SCREEN_NOT_REGISTERED = "SCREEN_NOT_REGISTERED";
/** The header a registered screen sends its secret in. */
export const SCREEN_HEADER = "x-kiosk-screen";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type Restaurant = { id: string; name: string; settings?: { requireRegisteredBornes?: boolean } | null };
type ScreenPrisma = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Prisma client, or a test's stand-in
  kiosk: { findFirst: (a: any) => Promise<any>; updateMany?: (a: any) => Promise<unknown> };
};

/**
 * Which borne is this screen? A registered screen is known by its secret alone (the address's ?borne= is ignored: it
 * cannot be used to pretend to be another borne). An unregistered device: refused when the restaurant requires
 * registered bornes; otherwise as before (the borne named in the address, or none).
 */
export async function resolveScreen(
  prisma: ScreenPrisma,
  restaurant: Restaurant,
  secret: string | undefined | null,
  borneCode?: string | null,
): Promise<{ id: string; code: string; name: string } | null> {
  if (secret && /^ksc_[A-Za-z0-9_-]{20,100}$/.test(secret)) {
    const k = await prisma.kiosk.findFirst({
      where: { restaurantId: restaurant.id, tokenHash: sha256(secret), tokenRevokedAt: null },
      select: { id: true, code: true, name: true, isEnabled: true },
    });
    if (k) {
      if (!k.isEnabled) throw unavailable(restaurant.name);
      return { id: k.id, code: k.code, name: k.name };
    }
  }
  if (restaurant.settings?.requireRegisteredBornes) {
    throw new UnauthorizedException({ code: SCREEN_NOT_REGISTERED, message: "This screen is not registered as one of the restaurant's bornes" });
  }
  return resolveBorne(prisma as never, restaurant.id, restaurant.name, borneCode);
}

/**
 * A screen trades the one-time code from the back office for its secret, and from then on is that borne. The code
 * belongs to one borne of one restaurant, works once and only for 15 minutes; a wrong, used or expired code all get the
 * same answer. Registering again (a new screen, a wiped browser) replaces the borne's previous screen.
 */
export async function redeemScreenCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Prisma client, or a test's stand-in
  prisma: { kiosk: { findFirst: (a: any) => Promise<any>; updateMany: (a: any) => Promise<{ count: number }> } },
  restaurantId: string,
  input: string,
  now = new Date(),
) {
  const bad = () => new BadRequestException("This code is not valid (it may be mistyped, used already, or older than 15 minutes). Get a new one in the back office: Bornes › Register a screen.");
  const code = normalizePairingCode(input);
  if (!code) throw bad();
  const hash = sha256(code);
  const k = await prisma.kiosk.findFirst({ where: { restaurantId, registrationCodeHash: hash }, select: { id: true, code: true, name: true } });
  if (!k) throw bad();
  const secret = `ksc_${randomBytes(32).toString("base64url")}`;
  // One step: two screens racing with the same code cannot both win.
  const won = await prisma.kiosk.updateMany({
    where: { id: k.id, restaurantId, registrationCodeHash: hash, registrationExpiresAt: { gt: now } },
    data: { registrationCodeHash: null, registrationExpiresAt: null, tokenHash: sha256(secret), tokenIssuedAt: now, tokenRevokedAt: null, status: "ONLINE" },
  });
  if (won.count !== 1) throw bad();
  return { secret, borne: { code: k.code, name: k.name } };
}
