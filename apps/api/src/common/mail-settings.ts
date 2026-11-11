import { Injectable } from "@nestjs/common";
import { Prisma, type MailSecurity } from "@prisma/client";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CryptoService, type Sealed } from "./crypto.service.js";

/** The email settings set in the admin, password in clear (only ever inside the server). */
export interface MailSettingsValues {
  enabled: boolean;
  fromEmail: string;
  fromName: string | null;
  host: string;
  port: number;
  security: MailSecurity;
  authEnabled: boolean;
  username: string | null;
  password: string | null;
}

/** What nodemailer needs to reach the SMTP server described by these settings. */
export function smtpOptions(s: Pick<MailSettingsValues, "host" | "port" | "security" | "authEnabled" | "username" | "password">): SMTPTransport.Options {
  return {
    host: s.host,
    port: s.port,
    // SSL: TLS from the first byte. STARTTLS: plain, then TLS before anything is sent, or nothing is sent. NONE: plain.
    secure: s.security === "SSL",
    requireTLS: s.security === "STARTTLS",
    ignoreTLS: s.security === "NONE",
    ...(s.authEnabled ? { auth: { user: s.username ?? "", pass: s.password ?? "" } } : {}),
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  };
}

/** "NEXBORN <no-reply@…>" from the settings: the sender every email shows. */
export const fromAddress = (s: Pick<MailSettingsValues, "fromEmail" | "fromName">) =>
  s.fromName?.trim() ? { name: s.fromName.trim(), address: s.fromEmail } : s.fromEmail;

/** How long a read of the settings is reused before the database is asked again (a save clears it at once). */
const CACHE_MS = 30_000;

/** The one row of email settings (id 1): read for every email (briefly cached), written from the admin. */
@Injectable()
export class MailSettingsStore {
  private cache: { at: number; value: (MailSettingsValues & { updatedAt: Date }) | null } | null = null;

  constructor(private readonly prisma: PrismaService, private readonly crypto: CryptoService) {}

  /** The saved settings, or null when the admin has never saved any (then the server's SMTP_* settings apply). */
  async load(now = Date.now()): Promise<(MailSettingsValues & { updatedAt: Date }) | null> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.mailSettings.findUnique({ where: { id: 1 } });
    const value = row
      ? {
          enabled: row.enabled, fromEmail: row.fromEmail, fromName: row.fromName, host: row.host, port: row.port,
          security: row.security, authEnabled: row.authEnabled, username: row.username,
          password: row.passwordSealed ? this.crypto.open(row.passwordSealed as unknown as Sealed) : null,
          updatedAt: row.updatedAt,
        }
      : null;
    this.cache = { at: now, value };
    return value;
  }

  /** Saves the settings. `password` undefined keeps the saved one; null removes it. */
  async save(values: Omit<MailSettingsValues, "password"> & { password?: string | null }, actorId: string) {
    const { password, ...rest } = values;
    // Prisma empties a Json column with DbNull, not with null.
    const sealed = password === undefined ? {} : { passwordSealed: password === null ? Prisma.DbNull : (this.crypto.seal(password) as never) };
    const data = { ...rest, updatedById: actorId, ...sealed };
    await this.prisma.mailSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    this.cache = null;
    return this.load();
  }
}
