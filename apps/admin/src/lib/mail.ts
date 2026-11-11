import { request } from "./api";

export type MailSecurity = "NONE" | "SSL" | "STARTTLS";

/** The email settings form. `password` empty means "keep the saved one": the server never sends it back. */
export interface MailForm {
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  host: string;
  port: number;
  security: MailSecurity;
  authEnabled: boolean;
  username: string;
  password: string;
}

export interface MailView {
  /** admin: the settings below are in use. server: the server's own (kiosk.env), until some are saved here. none: no email. */
  source: "admin" | "server" | "none";
  settings: (Omit<MailForm, "password" | "fromName" | "username"> & { fromName: string | null; username: string | null; passwordSet: boolean }) | null;
  server: { host: string; port: number; security: MailSecurity; username: string | null; from: string } | null;
  updatedAt: string | null;
}

export interface MailCheck { ok: boolean; message: string }

export const getMailSettings = () => request<MailView>("/admin/settings/mail");
export const saveMailSettings = (form: MailForm) =>
  request<MailView>("/admin/settings/mail", { method: "PUT", body: JSON.stringify(form) });
export const testMailConnection = (form: MailForm) =>
  request<MailCheck>("/admin/settings/mail/test-connection", { method: "POST", body: JSON.stringify(form) });
export const sendTestMail = (form: MailForm, to: string) =>
  request<MailCheck>("/admin/settings/mail/send-test", { method: "POST", body: JSON.stringify({ ...form, to }) });
