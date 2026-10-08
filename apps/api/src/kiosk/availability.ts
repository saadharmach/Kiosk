import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { isSubscribed } from "../common/subscription.js";

/** The kiosk recognises this code and shows its calm "temporarily unavailable" screen. */
export const RESTAURANT_UNAVAILABLE = "RESTAURANT_UNAVAILABLE";

/**
 * The one check every public kiosk route makes. An address that matches nothing is a plain 404. A restaurant
 * that exists but is not active (suspended or archived) is a 503 with a code the kiosk understands: the
 * answer is the same for both, so a customer is never told why, and the name is the only thing sent back
 * (it is already on the kiosk's own address and screens).
 */
/** The calm "temporarily unavailable" answer, shared by a switched-off restaurant and a switched-off borne. */
export function unavailable(restaurantName?: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: RESTAURANT_UNAVAILABLE,
    message: "This restaurant is not taking orders right now",
    ...(restaurantName ? { restaurantName } : {}),
  });
}

/**
 * Which borne is this? The kiosk page sends the code it was opened with. A code that matches nothing (a typo in a printed
 * address) is treated as "no borne": the order still goes through, on the restaurant's default printer, and nobody is
 * stranded at a machine. A borne that has been switched off takes no orders.
 */
export async function resolveBorne(
  prisma: { kiosk: { findFirst: (a: { where: { restaurantId: string; code: string }; select: { id: true; code: true; name: true; isEnabled: true } }) => Promise<{ id: string; code: string; name: string; isEnabled: boolean } | null> } },
  restaurantId: string,
  restaurantName: string,
  code?: string | null,
): Promise<{ id: string; code: string; name: string } | null> {
  if (!code) return null;
  const k = await prisma.kiosk.findFirst({ where: { restaurantId, code: code.toUpperCase() }, select: { id: true, code: true, name: true, isEnabled: true } });
  if (!k) return null;
  if (!k.isEnabled) throw unavailable(restaurantName);
  return { id: k.id, code: k.code, name: k.name };
}

export function requireOrderable<T extends { status: string; name?: string }>(restaurant: T | null | undefined): asserts restaurant is T {
  if (!restaurant) throw new NotFoundException("Restaurant not available");
  if (restaurant.status !== "ACTIVE") throw unavailable(restaurant.name);
}

/**
 * The subscription check, next to requireOrderable: without a running period the kiosk gets the same calm
 * "unavailable" answer as a switched-off restaurant (a customer is never told why).
 */
export async function requireSubscribed(
  prisma: Parameters<typeof isSubscribed>[0],
  restaurant: { id: string; name: string; timezone: string },
): Promise<void> {
  if (!(await isSubscribed(prisma, restaurant.id, restaurant.timezone))) throw unavailable(restaurant.name);
}
