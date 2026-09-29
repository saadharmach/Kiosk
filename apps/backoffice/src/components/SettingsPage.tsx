"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ORDER_TYPE_LABEL, getSettings, updateSettings,
  type OrderTypePatch, type OrderTypePayload, type SettingsFieldsPatch,
  type SettingsPatch, type SettingsPayload, type SettingsResponse,
} from "@/lib/settings";

const TABLE_PARTS = ["a", "b", "c", "d", "e", "f"] as const;

const SETTING_KEYS = [
  "askTableForEatIn", "kioskIdleTimeoutSec", "kioskResetDelaySec",
  "showAllergens", "showProductImages", "ticketFooterText",
] as const;

const field = "h-10 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) px-3";
const lbl = "mb-1 block text-sm text-(--color-ink-muted)";
const card = "rounded-(--radius-card) border border-(--color-line) bg-(--color-surface-2) p-5";
const hint = "mt-1 text-xs text-(--color-ink-muted)";

/** An empty box means "not set", which is null, not 0. */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function SettingsPage({ slug }: { slug: string }) {
  const [saved, setSaved] = useState<SettingsResponse | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [orderTypes, setOrderTypes] = useState<OrderTypePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const adopt = (res: SettingsResponse) => {
    setSaved(res);
    setSettings({ ...res.settings });
    setOrderTypes(res.orderTypes.map((o) => ({ ...o })));
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      adopt(await getSettings(slug));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const setOt = (i: number, patch: Partial<OrderTypePayload>) => {
    setJustSaved(false);
    setOrderTypes((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  };

  const setSet = (patch: Partial<SettingsPayload>) => {
    setJustSaved(false);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const dirty =
    Boolean(saved && settings) &&
    (JSON.stringify(settings) !== JSON.stringify(saved!.settings) ||
      JSON.stringify(orderTypes) !== JSON.stringify(saved!.orderTypes));

  const save = async () => {
    if (!saved || !settings) return;
    setBusy(true);
    setError(null);
    setJustSaved(false);
    try {
      const body: SettingsPatch = {};

      // Only changed fields travel: an untouched order type that has no sales
      // area yet would otherwise be rejected on every save.
      const s: SettingsFieldsPatch = {};
      for (const k of SETTING_KEYS) {
        if (settings[k] !== saved.settings[k]) (s as Record<string, unknown>)[k] = settings[k];
      }
      if (Object.keys(s).length > 0) body.settings = s;

      const changed: OrderTypePatch[] = [];
      orderTypes.forEach((d, i) => {
        if (JSON.stringify(d) === JSON.stringify(saved.orderTypes[i])) return;
        changed.push({
          orderType: d.orderType,
          isEnabled: d.isEnabled,
          ...(d.salesAreaId ? { salesAreaId: d.salesAreaId } : {}),
          fixedTableNumber: d.fixedTableNumber,
          tableRangeFrom: d.tableRangeFrom,
          tableRangeTo: d.tableRangeTo,
          tablePart: d.tablePart,
        });
      });
      if (changed.length > 0) body.orderTypes = changed;

      if (!body.settings && !body.orderTypes) return;

      adopt(await updateSettings(slug, body));
      setJustSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !saved) {
    return error
      ? <p className="text-(--color-danger)">{error}</p>
      : <p className="text-(--color-ink-muted)">Loading…</p>;
  }

  return (
    <div className="max-w-3xl pb-24">
      {saved.warnings.length > 0 ? (
        <div className={`mb-6 ${card}`}>
          <p className="mb-2 font-medium text-(--color-danger)">Worth checking</p>
          <ul className="list-disc space-y-1 ps-5 text-sm text-(--color-ink-muted)">
            {saved.warnings.map((w, i) => <li key={`${w.code}-${i}`}>{w.message}</li>)}
          </ul>
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Order types</h2>
        <div className="space-y-4">
          {orderTypes.map((ot, i) => {
            const asksCustomer = ot.orderType === "EAT_IN" && settings.askTableForEatIn;
            return (
              <div key={ot.orderType} className={card}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="font-medium">{ORDER_TYPE_LABEL[ot.orderType]}</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ot.isEnabled}
                      onChange={(e) => setOt(i, { isEnabled: e.target.checked })} />
                    Offered on the kiosk
                  </label>
                </div>

                {ot.orderType === "EAT_IN" ? (
                  <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={settings.askTableForEatIn}
                        onChange={(e) => setSet({ askTableForEatIn: e.target.checked })} />
                      Ask the customer for their table number
                    </label>
                    <p className={hint}>
                      Turn this off when customers take a numbered stand to their table.
                      The kiosk then allocates the next free number from the range below
                      and prints it on the ticket.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={lbl} htmlFor={`area-${ot.orderType}`}>Sales area</label>
                    <select id={`area-${ot.orderType}`} className={field}
                      value={ot.salesAreaId ?? ""}
                      onChange={(e) => setOt(i, { salesAreaId: e.target.value || null })}>
                      <option value="">Choose a sales area</option>
                      {saved.salesAreas.map((a) => (
                        <option key={a.untillId} value={a.untillId}>{a.number} — {a.name}</option>
                      ))}
                    </select>
                    <p className={hint}>Sets the price level unTill uses for this order type.</p>
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`part-${ot.orderType}`}>Table part</label>
                    <select id={`part-${ot.orderType}`} className={field}
                      value={ot.tablePart ?? "a"}
                      onChange={(e) => setOt(i, { tablePart: e.target.value })}>
                      {TABLE_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <p className={hint}>“a” is the main bill. Only change this for split bills.</p>
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`from-${ot.orderType}`}>
                      {asksCustomer ? "Lowest table number" : "Range start"}
                    </label>
                    <input id={`from-${ot.orderType}`} className={field} type="number" min={1}
                      value={ot.tableRangeFrom ?? ""}
                      onChange={(e) => setOt(i, { tableRangeFrom: numOrNull(e.target.value) })} />
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`to-${ot.orderType}`}>
                      {asksCustomer ? "Highest table number" : "Range end"}
                    </label>
                    <input id={`to-${ot.orderType}`} className={field} type="number" min={1}
                      value={ot.tableRangeTo ?? ""}
                      onChange={(e) => setOt(i, { tableRangeTo: numOrNull(e.target.value) })} />
                    <p className={hint}>
                      {asksCustomer
                        ? "A customer typing a number outside this range is refused."
                        : "Numbers are allocated from this range, one per order."}
                    </p>
                  </div>

                  {asksCustomer ? null : (
                    <div>
                      <label className={lbl} htmlFor={`fixed-${ot.orderType}`}>Fixed table</label>
                      <input id={`fixed-${ot.orderType}`} className={field} type="number" min={1}
                        value={ot.fixedTableNumber ?? ""}
                        onChange={(e) => setOt(i, { fixedTableNumber: numOrNull(e.target.value) })} />
                      <p className={hint}>
                        Every order goes to this one table. Leave empty to use the range instead.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Kiosk</h2>
        <div className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="idle">Idle timeout (seconds)</label>
              <input id="idle" className={field} type="number" min={15} max={600}
                value={settings.kioskIdleTimeoutSec}
                onChange={(e) => setSet({ kioskIdleTimeoutSec: Number(e.target.value) })} />
              <p className={hint}>How long an abandoned order waits before the kiosk clears it.</p>
            </div>

            <div>
              <label className={lbl} htmlFor="reset">Ticket display (seconds)</label>
              <input id="reset" className={field} type="number" min={3} max={120}
                value={settings.kioskResetDelaySec}
                onChange={(e) => setSet({ kioskResetDelaySec: Number(e.target.value) })} />
              <p className={hint}>How long the order number stays on screen before the next customer.</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.showProductImages}
                onChange={(e) => setSet({ showProductImages: e.target.checked })} />
              Show product photos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.showAllergens}
                onChange={(e) => setSet({ showAllergens: e.target.checked })} />
              Show allergens on the product sheet
            </label>
          </div>

          <div className="mt-4">
            <label className={lbl} htmlFor="footer">Ticket footer</label>
            <textarea id="footer" rows={2} maxLength={500}
              className="w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) p-3"
              value={settings.ticketFooterText ?? ""}
              onChange={(e) => setSet({ ticketFooterText: e.target.value })} />
            <p className={hint}>Printed under the order number. Leave empty for none.</p>
          </div>
        </div>
      </section>

      {error ? <p className="mb-4 text-sm text-(--color-danger)">{error}</p> : null}
      {justSaved && !dirty ? <p className="mb-4 text-sm text-(--color-ink-muted)">Saved.</p> : null}

      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={!dirty || busy}
          className="h-11 rounded-lg bg-(--color-brand) px-6 font-medium text-(--color-brand-ink) disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={load} disabled={!dirty || busy}
          className="h-11 rounded-lg border border-(--color-line) px-6 disabled:opacity-50">
          Discard changes
        </button>
      </div>
    </div>
  );
}