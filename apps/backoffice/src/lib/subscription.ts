import { request } from "./api";

/** Where the restaurant's subscription stands (dates only). */
export interface SubscriptionStanding {
  state: "active" | "ending" | "ended" | "none";
  coveredUntil: string | null;
  daysLeft: number;
  next: { startsOn: string } | null;
  /** The platform team chose to close the back office when no period is running. */
  closesWhenEnded: boolean;
}

/** Shown on the sign-in page once the back office has closed (what the API says at sign-in, in French). */
export const CLOSED_MESSAGE = "Votre abonnement est terminé : le back-office est fermé. Contactez-nous pour le renouveler : tout est conservé et revient comme avant.";
/** The API's own words for it (in English), recognised to show the French ones. */
export const isClosedMessage = (m: string) => m.startsWith("Your subscription has ended");

export const getSubscription = (slug: string) => request<SubscriptionStanding>(`/restaurant/${slug}/subscription`);
