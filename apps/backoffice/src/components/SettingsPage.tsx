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

const field = "field";
const lbl = "field-label";
const card = "card";
const hint = "mt-1 text-[12.5px] text-(--color-ink-muted)";
const check = "size-4 accent-(--color-brand)";

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
        if (!d.salesAreaId) {
          throw new Error(`${ORDER_TYPE_LABEL[d.orderType]} : choisissez d’abord sa zone de vente (la première case de sa carte), puis enregistrez. Si vous ne voulez pas le proposer, décochez « Proposé sur la borne » et laissez-le tel quel.`);
        }
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
      ? <p className="note note-err">{error}</p>
      : <p className="text-(--color-ink-muted)">Chargement…</p>;
  }

  const errors = saved.warnings.filter((w) => w.severity === "error");
  const others = saved.warnings.filter((w) => w.severity !== "error");
  const ranges = (rs: { fromTable: number; toTable: number }[]) =>
    rs.map((x) => (x.fromTable === x.toTable ? `${x.fromTable}` : `${x.fromTable}–${x.toTable}`)).join(", ");

  return (
    <div className="flex max-w-3xl flex-col gap-4 pb-24">
      {errors.length > 0 ? (
        <div role="alert" className="note note-err">
          <p className="mb-1 font-bold">À corriger : les clients ne peuvent pas commander ainsi</p>
          <ul className="list-disc space-y-1 ps-5">
            {errors.map((w, i) => <li key={`${w.code}-${i}`}>{w.message}</li>)}
          </ul>
        </div>
      ) : null}
      {others.length > 0 ? (
        <div className="note note-warn">
          <p className="mb-1 font-bold">À vérifier</p>
          <ul className="list-disc space-y-1 ps-5">
            {others.map((w, i) => <li key={`${w.code}-${i}`}>{w.message}</li>)}
          </ul>
        </div>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-[14.5px] font-bold">Modes de commande</h2>
        <div className="space-y-4">
          {orderTypes.map((ot, i) => {
            const asksCustomer = ot.orderType === "EAT_IN" && settings.askTableForEatIn;
            // What the server says is wrong with this one, as saved.
            const mine = errors.filter((w) => w.orderType === ot.orderType);
            const area = saved.salesAreas.find((a) => a.untillId === ot.salesAreaId);
            const areaGone = Boolean(ot.salesAreaId) && !area;
            return (
              <div key={ot.orderType} className={`${card} ${mine.length ? "border-(--color-danger)" : ""}`}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="flex items-center gap-2 font-bold">
                    {ORDER_TYPE_LABEL[ot.orderType]}
                    <span className={`badge ${ot.isEnabled ? "badge-ok" : "badge-muted"}`}>{ot.isEnabled ? "Proposé" : "Non proposé"}</span>
                  </h3>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className={check} checked={ot.isEnabled}
                      onChange={(e) => setOt(i, { isEnabled: e.target.checked })} />
                    Proposé sur la borne
                  </label>
                </div>

                {mine.length ? (
                  <ul className="note note-err mb-4 space-y-1">
                    {mine.map((w, k) => <li key={k}>{w.message}</li>)}
                  </ul>
                ) : null}

                {ot.orderType === "EAT_IN" ? (
                  <div className="mb-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className={check} checked={settings.askTableForEatIn}
                        onChange={(e) => setSet({ askTableForEatIn: e.target.checked })} />
                      Demander au client son numéro de table
                    </label>
                    <p className={hint}>
                      Désactivez-le quand les clients emportent un chevalet numéroté à leur table. La borne attribue alors le prochain
                      numéro libre de la plage ci-dessous et l’imprime sur le ticket.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={lbl} htmlFor={`area-${ot.orderType}`}>Zone de vente</label>
                    <select id={`area-${ot.orderType}`} className={`${field} ${areaGone ? "border-(--color-danger)" : ""}`}
                      value={ot.salesAreaId ?? ""}
                      onChange={(e) => setOt(i, { salesAreaId: e.target.value || null })}>
                      <option value="">Choisir une zone de vente</option>
                      {/* The saved one, when unTill no longer has it: shown for what it is, not as "nothing chosen". */}
                      {areaGone ? <option value={ot.salesAreaId!} disabled>N’existe plus dans unTill — à choisir de nouveau</option> : null}
                      {saved.salesAreas.map((a) => (
                        <option key={a.untillId} value={a.untillId}>{a.number} — {a.name}</option>
                      ))}
                    </select>
                    <p className={hint}>
                      {area && area.tableRanges.length
                        ? <>Tables de cette zone dans unTill : <b>{ranges(area.tableRanges)}</b>. </>
                        : null}
                      Fixe le niveau de prix qu’unTill utilise pour ce mode.
                    </p>
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`part-${ot.orderType}`}>Partie de table</label>
                    <select id={`part-${ot.orderType}`} className={field}
                      value={ot.tablePart ?? "a"}
                      onChange={(e) => setOt(i, { tablePart: e.target.value })}>
                      {TABLE_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <p className={hint}>« a » est l’addition principale. Ne changez que pour des additions séparées.</p>
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`from-${ot.orderType}`}>
                      {asksCustomer ? "Plus petit numéro de table" : "Début de la plage"}
                    </label>
                    <input id={`from-${ot.orderType}`} className={field} type="number" min={1}
                      value={ot.tableRangeFrom ?? ""}
                      onChange={(e) => setOt(i, { tableRangeFrom: numOrNull(e.target.value) })} />
                  </div>

                  <div>
                    <label className={lbl} htmlFor={`to-${ot.orderType}`}>
                      {asksCustomer ? "Plus grand numéro de table" : "Fin de la plage"}
                    </label>
                    <input id={`to-${ot.orderType}`} className={field} type="number" min={1}
                      value={ot.tableRangeTo ?? ""}
                      onChange={(e) => setOt(i, { tableRangeTo: numOrNull(e.target.value) })} />
                    <p className={hint}>
                      {asksCustomer
                        ? "Un numéro tapé hors de cette plage est refusé."
                        : "Les numéros sont attribués dans cette plage, un par commande."}
                    </p>
                  </div>

                  {asksCustomer ? null : (
                    <div>
                      <label className={lbl} htmlFor={`fixed-${ot.orderType}`}>Table fixe</label>
                      <input id={`fixed-${ot.orderType}`} className={field} type="number" min={1}
                        value={ot.fixedTableNumber ?? ""}
                        onChange={(e) => setOt(i, { fixedTableNumber: numOrNull(e.target.value) })} />
                      <p className={hint}>
                        Toutes les commandes vont à cette table. Laissez vide pour utiliser la plage.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-[14.5px] font-bold">Borne</h2>
        <div className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="idle">Délai d’inactivité (secondes)</label>
              <input id="idle" className={field} type="number" min={15} max={600}
                value={settings.kioskIdleTimeoutSec}
                onChange={(e) => setSet({ kioskIdleTimeoutSec: Number(e.target.value) })} />
              <p className={hint}>Combien de temps une commande abandonnée attend avant que la borne l’efface.</p>
            </div>

            <div>
              <label className={lbl} htmlFor="reset">Affichage du ticket (secondes)</label>
              <input id="reset" className={field} type="number" min={3} max={120}
                value={settings.kioskResetDelaySec}
                onChange={(e) => setSet({ kioskResetDelaySec: Number(e.target.value) })} />
              <p className={hint}>Combien de temps le numéro de commande reste affiché avant le client suivant.</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className={check} checked={settings.showProductImages}
                onChange={(e) => setSet({ showProductImages: e.target.checked })} />
              Afficher les photos des articles
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className={check} checked={settings.showAllergens}
                onChange={(e) => setSet({ showAllergens: e.target.checked })} />
              Afficher les allergènes sur la fiche article
            </label>
          </div>

          <div className="mt-4">
            <label className={lbl} htmlFor="footer">Pied de page du ticket</label>
            <textarea id="footer" rows={2} maxLength={500} className="field"
              value={settings.ticketFooterText ?? ""}
              onChange={(e) => setSet({ ticketFooterText: e.target.value })} />
            <p className={hint}>Imprimé sous le numéro de commande. Laissez vide pour ne rien imprimer.</p>
          </div>
        </div>
      </section>

      {error ? <p role="alert" className="note note-err">{error}</p> : null}

      {/* Always in reach while editing, like the mockup's form footer. */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2.5 border-t border-(--color-line) bg-(--color-page) px-1 py-3">
        <button type="button" onClick={save} disabled={!dirty || busy} className="btn btn-primary">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={load} disabled={!dirty || busy} className="btn btn-secondary">Annuler</button>
        <span className="flex-1" />
        {dirty ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-(--color-warning)"><span className="dot dot-warn" />Modifications non enregistrées</span>
        ) : justSaved ? <span role="status" className="badge badge-ok">Enregistré</span> : null}
      </div>
    </div>
  );
}