"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMailSettings, saveMailSettings, sendTestMail, testMailConnection,
  type MailCheck, type MailForm, type MailSecurity, type MailView,
} from "@/lib/mail";
import { ErrorText, Field, input, primary, secondary } from "./ui";

const SECURITY: { value: MailSecurity; label: string; port: number }[] = [
  { value: "STARTTLS", label: "STARTTLS (usually port 587)", port: 587 },
  { value: "SSL", label: "SSL / TLS (usually port 465)", port: 465 },
  { value: "NONE", label: "None (only for a server on the same network)", port: 25 },
];

/** The form filled from what is saved, or from the server's own settings when nothing is saved yet. */
function formFrom(v: MailView): MailForm {
  if (v.settings) {
    // passwordSet is for display only: the API rejects any field the form does not have.
    const { passwordSet: _passwordSet, ...s } = v.settings;
    return { ...s, fromName: s.fromName ?? "", username: s.username ?? "", password: "" };
  }
  // "NEXBORN <no-reply@…>" from the server's MAIL_FROM, split into name and address.
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v.server?.from ?? "");
  return {
    enabled: true,
    fromEmail: m ? m[2]! : (v.server?.from ?? ""),
    fromName: m ? m[1]!.trim() : "NEXBORN",
    host: v.server?.host ?? "",
    port: v.server?.port ?? 587,
    security: v.server?.security ?? "STARTTLS",
    authEnabled: v.server ? Boolean(v.server.username) : true,
    username: v.server?.username ?? "",
    password: "",
  };
}

const Toggle = ({ id, checked, onChange, disabled, title, text }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; title: string; text: string }) => (
  <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
    <input id={id} type="checkbox" className="mt-0.5 size-[18px] accent-(--color-brand)" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span><span className="block font-semibold">{title}</span><span className="block text-[12.5px] text-(--color-ink-muted)">{text}</span></span>
  </label>
);

/** Settings › Email: the SMTP server every email of the platform goes through (invitations, password resets). */
export default function EmailSettingsPage({ canWrite, myEmail }: { canWrite: boolean; myEmail: string }) {
  const [view, setView] = useState<MailView | null>(null);
  const [form, setForm] = useState<MailForm | null>(null);
  const [testTo, setTestTo] = useState(myEmail);
  const [busy, setBusy] = useState<null | "save" | "test" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<MailCheck | null>(null);
  const [saved, setSaved] = useState(false);

  const adopt = useCallback((v: MailView) => { setView(v); setForm(formFrom(v)); }, []);
  useEffect(() => { getMailSettings().then(adopt).catch((e) => setError((e as Error).message)); }, [adopt]);

  if (!view || !form) return error ? <ErrorText message={error} /> : <p className="text-(--color-ink-muted)">Loading…</p>;

  const set = (patch: Partial<MailForm>) => { setForm({ ...form, ...patch }); setSaved(false); setCheck(null); };
  const run = async (what: "save" | "test" | "send") => {
    setBusy(what); setError(null); setCheck(null); setSaved(false);
    try {
      if (what === "save") { adopt(await saveMailSettings(form)); setSaved(true); }
      else if (what === "test") setCheck(await testMailConnection(form));
      else setCheck(await sendTestMail(form, testTo.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const ro = !canWrite || busy !== null;
  const passwordKept = Boolean(view.settings?.passwordSet);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {view.source === "admin" ? (
        <p className="note note-ok">These settings are in use for every email the platform sends (invitations, password resets).</p>
      ) : view.source === "server" ? (
        <p className="note note-info">
          Email currently uses the server&apos;s own settings ({view.server?.host}:{view.server?.port}). They are filled in below:
          saving here takes over from them. The server&apos;s password is not shown: type it again.
        </p>
      ) : (
        <p className="note note-warn">No email server is set up yet: invitations and password resets cannot be sent.</p>
      )}
      {!canWrite ? <p className="note note-warn">Read-only: only a super admin can change or test these settings.</p> : null}

      <section className="card flex flex-col gap-4">
        <h2 className="card-title mb-0">Email service</h2>
        <Toggle id="mail-enabled" checked={form.enabled} disabled={ro} onChange={(enabled) => set({ enabled })}
          title="Send emails" text="Off: the platform sends no email at all; invitations and password resets say so instead." />
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="card-title mb-0 sm:col-span-2">Sender</h2>
        <Field label="Sender email address"><input className={input} type="email" value={form.fromEmail} disabled={ro} placeholder="no-reply@nexborn.ma" onChange={(e) => set({ fromEmail: e.target.value })} /></Field>
        <Field label="Sender name"><input className={input} value={form.fromName} disabled={ro} placeholder="NEXBORN" onChange={(e) => set({ fromName: e.target.value })} /></Field>
      </section>

      <section className="card grid gap-4 sm:grid-cols-[1fr_9rem]">
        <h2 className="card-title mb-0 sm:col-span-2">SMTP server</h2>
        <Field label="SMTP host"><input className={input} value={form.host} disabled={ro} placeholder="smtp-relay.brevo.com" onChange={(e) => set({ host: e.target.value })} /></Field>
        <Field label="SMTP port"><input className={input} type="number" min={1} max={65535} value={form.port} disabled={ro} onChange={(e) => set({ port: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Security type">
            <select className={input} value={form.security} disabled={ro}
              // The usual port comes with the security type, unless one was already typed that is not a usual one.
              onChange={(e) => {
                const s = SECURITY.find((x) => x.value === e.target.value)!;
                set({ security: s.value, port: SECURITY.some((x) => x.port === form.port) ? s.port : form.port });
              }}>
              {SECURITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="card-title mb-0">Authentication</h2>
        <Toggle id="mail-auth" checked={form.authEnabled} disabled={ro} onChange={(authEnabled) => set({ authEnabled })}
          title="The SMTP server needs a username and password" text="Almost always on (Brevo, Gmail, Office 365…)." />
        {form.authEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SMTP username"><input className={input} value={form.username} disabled={ro} autoComplete="off" onChange={(e) => set({ username: e.target.value })} /></Field>
            <Field label="SMTP password" hint={passwordKept ? "A password is saved. Leave empty to keep it, or type a new one." : "Not saved yet."}>
              <input className={input} type="password" value={form.password} disabled={ro} autoComplete="new-password"
                placeholder={passwordKept ? "••••••••" : ""} onChange={(e) => set({ password: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </section>

      {canWrite ? (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <button className={primary} disabled={busy !== null} onClick={() => void run("save")}>{busy === "save" ? "Saving…" : "Save settings"}</button>
            <button className={secondary} disabled={busy !== null} onClick={() => void run("test")}>{busy === "test" ? "Testing…" : "Test SMTP connection"}</button>
            {saved ? <span role="status" className="badge badge-ok">Saved</span> : null}
          </div>

          <section className="card flex flex-col gap-3">
            <h2 className="card-title mb-0">Send a test email</h2>
            <p className="text-(--color-ink-muted)">Sends one email with the settings above, saved or not, so you can try them before saving.</p>
            <div className="flex flex-wrap gap-2.5">
              <input className={`${input} min-w-0 flex-1`} type="email" value={testTo} aria-label="Send the test email to" onChange={(e) => { setTestTo(e.target.value); setCheck(null); }} />
              <button className={secondary} disabled={busy !== null || !testTo.trim()} onClick={() => void run("send")}>{busy === "send" ? "Sending…" : "Send test email"}</button>
            </div>
          </section>
        </>
      ) : null}

      {check ? <p role="status" className={`note ${check.ok ? "note-ok" : "note-err"}`}>{check.message}</p> : null}
      <ErrorText message={error} />
    </div>
  );
}
