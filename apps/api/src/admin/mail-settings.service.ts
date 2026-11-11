import { BadRequestException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import nodemailer from "nodemailer";
import { AuditService } from "../common/audit.service.js";
import { MailSettingsStore, fromAddress, smtpOptions, type MailSettingsValues } from "../common/mail-settings.js";
import { MailerService } from "../common/mailer.service.js";
import type { MailSettingsDto } from "./dto/mail-settings.dto.js";

/** What the admin is told after a connection test or a test email: never an error page, always a sentence. */
export interface MailCheck { ok: boolean; message: string }

/** Plain words for what the SMTP server or the network answered. */
export function explainSmtp(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  // nodemailer often reports the network's own code inside its message ("connect ECONNREFUSED 1.2.3.4:587").
  const says = (code: string) => err.code === code || (err.message ?? "").includes(code);
  if (err.code === "EAUTH" || err.responseCode === 535) return "The SMTP server refused the username or password.";
  if (says("ECONNREFUSED")) return "The SMTP server refused the connection: check the server and the port.";
  if (says("ENOTFOUND") || err.code === "EDNS") return "This SMTP server name does not exist: check its spelling.";
  if (says("ETIMEDOUT") || err.code === "ETIMEDOUT" || (err.code === "ESOCKET" && /timeout/i.test(err.message ?? ""))) return "The SMTP server did not answer in time: check the server, the port and the security type.";
  if (/wrong version number|ssl3_get_record|tls/i.test(err.message ?? "")) return "The security type does not match this port: usually SSL goes with 465 and STARTTLS with 587.";
  if (err.code === "EENVELOPE") return `The SMTP server refused the addresses: ${err.message}`;
  return `The SMTP server answered: ${(err.message ?? String(e)).slice(0, 200)}`;
}

/** Settings › Email in the platform admin: the platform's SMTP settings, a connection test and a test email. */
@Injectable()
export class MailSettingsService {
  /** Makes the SMTP connection; a test replaces it so nothing goes on the network. */
  protected createTransport = nodemailer.createTransport;

  constructor(
    private readonly store: MailSettingsStore,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  /** The form as saved (never the password, only whether one is kept), and where email comes from today. */
  async view() {
    const saved = await this.store.load();
    const settings = saved
      ? {
          enabled: saved.enabled, fromEmail: saved.fromEmail, fromName: saved.fromName, host: saved.host, port: saved.port,
          security: saved.security, authEnabled: saved.authEnabled, username: saved.username, passwordSet: Boolean(saved.password),
        }
      : null;
    const server = this.mailer.server;
    return {
      /** admin: these settings are in use. server: the server's own (kiosk.env) until some are saved here. none: no email. */
      source: saved ? ("admin" as const) : server ? ("server" as const) : ("none" as const),
      settings,
      server: server ? { host: server.host, port: server.port, security: server.secure ? "SSL" : "STARTTLS", username: server.username, from: server.from } : null,
      updatedAt: saved?.updatedAt ?? null,
    };
  }

  /** The form's values with the password filled in: the one typed, or else the saved one. */
  private async values(dto: MailSettingsDto): Promise<MailSettingsValues> {
    const saved = await this.store.load();
    const typed = dto.password ?? "";
    const password = dto.authEnabled ? (typed || saved?.password || null) : null;
    const username = dto.username?.trim() || null;
    if (dto.authEnabled && !username) throw new BadRequestException("Enter the SMTP username, or switch SMTP authentication off.");
    if (dto.authEnabled && !password) throw new BadRequestException("Enter the SMTP password.");
    return {
      enabled: dto.enabled, fromEmail: dto.fromEmail.trim(), fromName: dto.fromName?.trim() || null,
      host: dto.host.trim(), port: dto.port, security: dto.security, authEnabled: dto.authEnabled, username, password,
    };
  }

  async save(dto: MailSettingsDto, actor: { id: string }, req?: Request) {
    const before = await this.view();
    const v = await this.values(dto);
    // A typed password replaces the saved one; with authentication off, none is kept.
    await this.store.save({ ...v, password: !v.authEnabled ? null : dto.password ? dto.password : undefined }, actor.id);
    const after = await this.view();
    await this.audit.record({
      actorType: "PLATFORM_USER", actorId: actor.id, action: "mail_settings.updated", entityType: "MailSettings", entityId: "1",
      before: before.settings, after: { ...after.settings, passwordChanged: Boolean(dto.password) },
    }, req);
    return after;
  }

  /** Connects and signs in with the form's values (saved or not), without sending anything. */
  async testConnection(dto: MailSettingsDto): Promise<MailCheck> {
    const v = await this.values(dto);
    const transport = this.createTransport(smtpOptions(v));
    try {
      await transport.verify();
      return { ok: true, message: `Connected to ${v.host}:${v.port}${v.authEnabled ? ` and signed in as ${v.username}` : ""}.` };
    } catch (e) {
      return { ok: false, message: explainSmtp(e) };
    } finally {
      transport.close();
    }
  }

  /** Sends one test email with the form's values (saved or not), to the address given. */
  async sendTest(dto: MailSettingsDto, to: string, actor: { id: string }, req?: Request): Promise<MailCheck> {
    const v = await this.values(dto);
    const transport = this.createTransport(smtpOptions(v));
    try {
      await transport.sendMail({
        from: fromAddress(v),
        to,
        subject: "NEXBORN — test email",
        text: `This is a test email from the NEXBORN platform admin.\n\nIt was sent through ${v.host}:${v.port} (${v.security}). If you can read it, these email settings work.`,
        html: `<p>This is a test email from the NEXBORN platform admin.</p><p>It was sent through <b>${v.host}:${v.port}</b> (${v.security}). If you can read it, these email settings work.</p>`,
      });
      await this.audit.record({ actorType: "PLATFORM_USER", actorId: actor.id, action: "mail_settings.test_sent", entityType: "MailSettings", entityId: "1", after: { to } }, req);
      return { ok: true, message: `Test email sent to ${to}. Check that inbox (and its spam folder).` };
    } catch (e) {
      return { ok: false, message: explainSmtp(e) };
    } finally {
      transport.close();
    }
  }
}
