import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";

/** The kiosk recognises this code and shows its calm "temporarily unavailable" screen. */
export const RESTAURANT_UNAVAILABLE = "RESTAURANT_UNAVAILABLE";

/**
 * The one check every public kiosk route makes. An address that matches nothing is a plain 404. A restaurant
 * that exists but is not active (suspended or archived) is a 503 with a code the kiosk understands: the
 * answer is the same for both, so a customer is never told why, and the name is the only thing sent back
 * (it is already on the kiosk's own address and screens).
 */
export function requireOrderable<T extends { status: string; name?: string }>(restaurant: T | null | undefined): asserts restaurant is T {
  if (!restaurant) throw new NotFoundException("Restaurant not available");
  if (restaurant.status !== "ACTIVE") {
    throw new ServiceUnavailableException({
      code: RESTAURANT_UNAVAILABLE,
      message: "This restaurant is not taking orders right now",
      ...(restaurant.name ? { restaurantName: restaurant.name } : {}),
    });
  }
}
