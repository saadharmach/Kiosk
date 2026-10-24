"use client";

import { useEffect, useRef, useState } from "react";
import { CLOSED_MESSAGE, getSubscription, type SubscriptionStanding } from "@/lib/subscription";

const day = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Only shown when it matters: the last week of the subscription, and once it has ended (the kiosks are then off, but
 * the back office stays open). Looked at again every few minutes, so it changes at midnight without a reload.
 */
export default function SubscriptionBanner({ slug, onClosed }: { slug: string; onClosed: (message: string) => void }) {
  const [s, setS] = useState<SubscriptionStanding | null>(null);
  useEffect(() => {
    const load = () => getSubscription(slug).then(setS).catch(() => undefined);
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [slug]);
  // When the platform team chose to close the back office, an open one signs out once nothing runs (the API also
  // refuses to renew the session, so it closes within 15 minutes at the latest).
  const closed = Boolean(s?.closesWhenEnded && (s.state === "ended" || s.state === "none"));
  const told = useRef(false);
  useEffect(() => {
    if (closed && !told.current) { told.current = true; onClosed(CLOSED_MESSAGE); }
  }, [closed, onClosed]);

  if (!s || s.state === "active") return null;
  if (s.state === "ending") {
    return (
      <div role="status" className="note note-warn mb-4">
        <p className="font-semibold">
          Votre abonnement se termine le {day(s.coveredUntil!)} ({s.daysLeft === 1 ? "c’est le dernier jour" : `dans ${s.daysLeft} jours`}).
        </p>
        <p>
          Ensuite, vos bornes ne prennent plus de commandes{s.closesWhenEnded ? " et ce back-office ferme" : ""}. Contactez-nous pour le renouveler.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="note note-err mb-4">
      <p className="font-semibold">Votre abonnement est terminé : vos bornes ne prennent plus de commandes.</p>
      <p>
        Tout est conservé et fonctionne ici. Contactez-nous pour le renouveler : les bornes repartent d’elles-mêmes.
        {s.next ? ` Votre prochaine période commence le ${day(s.next.startsOn)}.` : ""}
      </p>
    </div>
  );
}
