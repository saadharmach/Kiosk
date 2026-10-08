"use client";

import { useEffect, useState } from "react";
import { getSubscription, type SubscriptionStanding } from "@/lib/subscription";

const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Only shown when it matters: the last week of the subscription, and once it has ended (the kiosks are then off, but
 * the back office stays open). Looked at again every few minutes, so it changes at midnight without a reload.
 */
export default function SubscriptionBanner({ slug }: { slug: string }) {
  const [s, setS] = useState<SubscriptionStanding | null>(null);
  useEffect(() => {
    const load = () => getSubscription(slug).then(setS).catch(() => undefined);
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [slug]);

  if (!s || s.state === "active") return null;
  if (s.state === "ending") {
    return (
      <div role="status" className="mb-6 rounded-(--radius-card) border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
        <p className="font-medium">
          Your subscription ends on {day(s.coveredUntil!)} ({s.daysLeft === 1 ? "today is the last day" : `in ${s.daysLeft} days`}).
        </p>
        <p className="text-sm">After that your kiosks stop taking orders. Contact us to renew.</p>
      </div>
    );
  }
  return (
    <div role="alert" className="mb-6 rounded-(--radius-card) border-2 border-(--color-danger) bg-red-50 p-4 text-red-950">
      <p className="font-medium">Your subscription has ended: your kiosks are not taking orders.</p>
      <p className="text-sm">
        Everything here is kept and still works. Contact us to renew and the kiosks come back on by themselves.
        {s.next ? ` Your next period starts on ${day(s.next.startsOn)}.` : ""}
      </p>
    </div>
  );
}
