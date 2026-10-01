import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage { to: string; subject: string; text: string; html: string }

export type MailMode = "smtp" | "log" | "unconfigured";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up on this server (SMTP_HOST and MAIL_FROM are missing).");
    this.name = "MailNotConfiguredError";
  }
}

/**
 * Sends email. With SMTP_HOST set it uses that server (any provider that offers SMTP: Resend, Postmark, Brevo, Gmail...).
 * With none set, a development machine writes each message to the log instead (the link inside can be opened by hand), and
 * a PRODUCTION server refuses to send rather than quietly dropping or logging invitations.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  readonly mode: MailMode;
  readonly from: string;
  /** The last few messages "sent" in log mode, newest last: for a developer and for tests. */
  readonly outbox: MailMessage[] = [];
  private smtp: Transporter | null = null;

  /** `env` can be replaced in tests; a running server leaves it out and reads the real environment. */
  constructor(@Optional() @Inject("MAIL_ENV") env: NodeJS.ProcessEnv = process.env) {
    const host = env.SMTP_HOST?.trim();
    if (host) {
      this.mode = "smtp";
      const from = env.MAIL_FROM?.trim();
      if (!from) throw new Error("MAIL_FROM is required when SMTP_HOST is set (for example: Kiosk Platform <no-reply@yourdomain.com>)");
      this.from = from;
      const port = Number(env.SMTP_PORT ?? 587);
      this.smtp = nodemailer.createTransport({
        host, port,
        // Port 465 is TLS from the first byte; the usual 587 starts plain and upgrades (STARTTLS), which nodemailer does itself.
        secure: (env.SMTP_SECURE ?? String(port === 465)).toLowerCase() === "true",
        ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } } : {}),
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      });
      this.logger.log(`Email goes through SMTP at ${host}:${port}`);
    } else if (env.NODE_ENV === "production") {
      this.mode = "unconfigured";
      this.from = "";
      this.logger.error("Email is not configured: set SMTP_HOST and MAIL_FROM. Invitations cannot be sent.");
    } else {
      this.mode = "log";
      this.from = env.MAIL_FROM?.trim() || "Kiosk Platform <no-reply@localhost>";
      this.logger.warn("No SMTP_HOST set: emails are written to this log instead of being sent (development mode)");
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (this.mode === "unconfigured") throw new MailNotConfiguredError();
    if (this.mode === "log") {
      this.outbox.push(message);
      if (this.outbox.length > 20) this.outbox.shift();
      // The body holds the link, which is a credential: shown only on a development machine, never in production.
      this.logger.log(`[dev mail] to ${message.to} — ${message.subject}\n${message.text}`);
      return;
    }
    await this.smtp!.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
  }
}
