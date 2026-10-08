import { request } from "./api";

/** Where the restaurant's subscription stands (dates only). */
export interface SubscriptionStanding {
  state: "active" | "ending" | "ended" | "none";
  coveredUntil: string | null;
  daysLeft: number;
  next: { startsOn: string } | null;
}

export const getSubscription = (slug: string) => request<SubscriptionStanding>(`/restaurant/${slug}/subscription`);
