"use client";

import { useState } from "react";
import { BACKOFFICE_URL, KIOSK_URL, updateRestaurant, type RestaurantDetail, type Status } from "@/lib/platform";
import { ErrorText, Field, input, primary, secondary } from "./ui";

const STATUS_ACTIONS: Record<Status, { to: Status; label: string; warn: string }[]> = {
  ACTIVE: [
    { to: "SUSPENDED", label: "Suspend", warn: "Suspend this restaurant? Its kiosk stops working and its staff cannot sign in until you activate it again." },
    { to: "ARCHIVED", label: "Archive", warn: "Archive this restaurant? It is switched off like a suspended one and marked as closed for good." },
  ],
  SUSPENDED: [
    { to: "ACTIVE", label: "Activate", warn: "Activate this restaurant? Its kiosk and staff sign-in start working again." },
    { to: "ARCHIVED", label: "Archive", warn: "Archive this restaurant?" },
  ],
  ARCHIVED: [{ to: "ACTIVE", label: "Reactivate", warn: "Reactivate this archived restaurant?" }],
};

export default function DetailsTab({ r, canWrite, onChanged }: { r: RestaurantDetail; canWrite: boolean; onChanged: () => void }) {
  // The address can change until the restaurant has taken its first order; after that it is part of a printed,
  // installed kiosk and is fixed.
  const slugEditable = canWrite && r._count.orders === 0;
  const [f, setF] = useState({
    slug: r.slug, name: r.name, city: r.city ?? "", country: r.country ?? "", currency: r.currency, locale: r.locale, timezone: r.timezone,
    contactEmail: r.contactEmail ?? "", contactPhone: r.contactPhone ?? "", addressLine: r.addressLine ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };

  const run = async (body: Parameters<typeof updateRestaurant>[1]) => {
    setBusy(true); setError(null);
    try { await updateRestaurant(r.id, body); setSaved(true); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const save = () => {
    // Only what was filled in is sent: an emptied optional field is left as it is, not blanked with "".
    const body = Object.fromEntries(
      Object.entries(f).filter(([k, v]) => v.trim() !== "" && (k !== "slug" || v !== r.slug)),   // the address only when it changed
    ) as typeof f;
    return run(body);
  };

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Details</h2>
        <fieldset disabled={!canWrite || busy} className="grid gap-4 md:grid-cols-3">
          <Field label="Address on the kiosk" hint={slugEditable
            ? "Lowercase letters, digits and dashes. Changing it breaks any kiosk already opened at the old address, so do it before the kiosk is installed."
            : "Fixed: the restaurant has taken orders, so its kiosk address can no longer change."}>
            <input className={input} value={f.slug} disabled={!slugEditable} pattern="[a-z0-9]([a-z0-9\-]{0,58}[a-z0-9])?" maxLength={60}
              onChange={(e) => { setF({ ...f, slug: e.target.value.toLowerCase() }); setSaved(false); }} />
          </Field>
          <Field label="Name"><input className={input} value={f.name} minLength={2} maxLength={120} onChange={set("name")} /></Field>
          <Field label="City"><input className={input} value={f.city} maxLength={120} onChange={set("city")} /></Field>
          <Field label="Country (2 letters)"><input className={input} value={f.country} minLength={2} maxLength={2} onChange={(e) => { setF({ ...f, country: e.target.value.toUpperCase() }); setSaved(false); }} /></Field>
          <Field label="Currency"><input className={input} value={f.currency} minLength={3} maxLength={3} onChange={(e) => { setF({ ...f, currency: e.target.value.toUpperCase() }); setSaved(false); }} /></Field>
          <Field label="Main language">
            <select className={input} value={f.locale} onChange={set("locale")}>
              <option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option>
            </select>
          </Field>
          <Field label="Time zone"><input className={input} value={f.timezone} onChange={set("timezone")} /></Field>
          <Field label="Contact email"><input type="email" className={input} value={f.contactEmail} onChange={set("contactEmail")} /></Field>
          <Field label="Contact phone"><input className={input} value={f.contactPhone} onChange={set("contactPhone")} /></Field>
          <Field label="Address"><input className={input} value={f.addressLine} onChange={set("addressLine")} /></Field>
        </fieldset>
        {canWrite ? (
          <div className="mt-4 flex items-center gap-3">
            <button onClick={save} disabled={busy} className={primary}>{busy ? "Saving…" : "Save"}</button>
            {saved ? <span role="status" className="text-sm text-(--color-ink-muted)">Saved</span> : null}
            <ErrorText message={error} />
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Status</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">
          Currently <strong>{r.status.toLowerCase()}</strong>. A restaurant that is not active has its kiosk switched off and its staff cannot sign in.
        </p>
        {canWrite ? (
          <div className="flex gap-3">
            {STATUS_ACTIONS[r.status].map((a) => (
              <button key={a.to} disabled={busy} className={secondary} onClick={() => { if (window.confirm(a.warn)) void run({ status: a.to }); }}>{a.label}</button>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Links</h2>
        <ul className="space-y-1 text-sm">
          <li>Kiosk: <a className="underline" href={`${KIOSK_URL}/r/${r.slug}`} target="_blank" rel="noreferrer">{KIOSK_URL}/r/{r.slug}</a></li>
          <li>Restaurant back office: <a className="underline" href={BACKOFFICE_URL} target="_blank" rel="noreferrer">{BACKOFFICE_URL}</a> (sign in with the address <code>{r.slug}</code>)</li>
        </ul>
      </section>
    </div>
  );
}
