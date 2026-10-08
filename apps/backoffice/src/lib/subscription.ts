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

/** Shown on the sign-in page once the back office has closed (the same words the API gives at sign-in). */
export const CLOSED_MESSAGE = "Your subscription has ended, so the back office is closed. Contact us to renew: everything is kept and comes back as it was.";

export const getSubscription = (slug: string) => request<SubscriptionStanding>(`/restaurant/${slug}/subscription`);
