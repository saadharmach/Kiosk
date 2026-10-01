import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { promises as dns } from "node:dns";

export type EmailProblem = "reserved" | "disposable" | "no_mail_server";
/** `checked: false` means we could not look (a broken lookup): the address is let through, but not remembered as good. */
export type EmailVerdict = { ok: true; checked: boolean } | { ok: false; reason: EmailProblem; message: string };

/** Names that exist only for testing or inside a private network (RFC 2606, RFC 6761 and the usual home/office ones). */
const RESERVED_SUFFIXES = [".test", ".example", ".invalid", ".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".localdomain", ".intranet"];
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org", "localhost"];

/** Well-known throw-away mailbox services: an account made with one cannot be reached again later. */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "throwawaymail.com", "yopmail.com", "yopmail.fr", "trashmail.com", "getnada.com",
  "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempinbox.com", "spamgourmet.com",
  "mailnesia.com", "burnermail.io", "moakt.com", "tmpmail.org", "fakemail.net", "discard.email", "mailcatch.com",
]);

const LOOKUP_TIMEOUT_MS = 3000;
const CACHE_MS = 10 * 60_000;

export interface MailResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const domainOf = (email: string) => email.trim().toLowerCase().split("@").pop() ?? "";

/** Pure part: placeholder and throw-away domains. No network. */
export function offlineProblem(email: string): { reason: EmailProblem; message: string } | null {
  const domain = domainOf(email);
  if (!domain.includes(".") || RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)) || RESERVED_SUFFIXES.some((s) => domain.endsWith(s))) {
    return { reason: "reserved", message: `${domain} is not a real mail domain: it is only used for testing. Use the person's real email address.` };
  }
  if (DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`))) {
    return { reason: "disposable", message: `${domain} is a throw-away mailbox service. Use the person's real email address.` };
  }
  return null;
}

const codeOf = (e: unknown) => (e as { code?: string })?.code;
/** "This name has no such record": a real, final answer. Anything else (timeouts, a flaky resolver) is not. */
const NO_RECORD = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

/**
 * Checks that an address could be a real one: not a placeholder, not a throw-away service, and its domain has a mail
 * server (an MX record, or failing that an address record, as mail delivery itself does). It cannot prove that the
 * PERSON owns the address: that takes a confirmation email.
 *
 * A broken lookup (no network, a slow resolver) never blocks someone: only a definite "this domain has no mail
 * server" does.
 */
export async function checkRealEmail(email: string, resolver: MailResolver = dns, log: (m: string) => void = () => undefined): Promise<EmailVerdict> {
  const offline = offlineProblem(email);
  if (offline) return { ok: false, ...offline };

  const domain = domainOf(email);
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("lookup timed out"), { code: "ETIMEOUT" })), LOOKUP_TIMEOUT_MS).unref?.())]);
  const noMail = { ok: false as const, reason: "no_mail_server" as const, message: `${domain} cannot receive email. Check the spelling of the address.` };

  try {
    const mx = await withTimeout(resolver.resolveMx(domain));
    // A single MX of "." means "this domain deliberately takes no email" (RFC 7505).
    if (mx.length > 0 && mx.every((m) => m.exchange === "" || m.exchange === ".")) return noMail;
    if (mx.length > 0) return { ok: true, checked: true };
  } catch (e) {
    if (!NO_RECORD.has(codeOf(e) ?? "")) {
      log(`Could not check the mail server of ${domain} (${codeOf(e) ?? String(e)}); accepting the address`);
      return { ok: true, checked: false };
    }
  }

  // No MX: mail is then delivered to the domain's own address, if it has one.
  for (const lookup of [() => resolver.resolve4(domain), () => resolver.resolve6(domain)]) {
    try {
      if ((await withTimeout(lookup())).length > 0) return { ok: true, checked: true };
    } catch (e) {
      if (!NO_RECORD.has(codeOf(e) ?? "")) {
        log(`Could not check ${domain} (${codeOf(e) ?? String(e)}); accepting the address`);
        return { ok: true, checked: false };
      }
    }
  }
  return noMail;
}

/** Used wherever an account is made for a person: refuses an address that cannot be real. */
@Injectable()
export class EmailCheckService {
  private readonly logger = new Logger(EmailCheckService.name);
  private readonly cache = new Map<string, { at: number; verdict: EmailVerdict }>();
  /** EMAIL_CHECK=off turns the whole check off (for a development machine with no internet). */
  private readonly enabled = (process.env.EMAIL_CHECK ?? "on").toLowerCase() !== "off";

  /** Replaceable, so tests never touch the network. */
  resolver: MailResolver = dns;

  async assertReal(email: string, now = Date.now()): Promise<void> {
    if (!this.enabled) return;
    const key = domainOf(email);
    const hit = this.cache.get(key);
    let verdict: EmailVerdict;
    if (hit && now - hit.at < CACHE_MS) verdict = hit.verdict;
    else {
      verdict = await checkRealEmail(email, this.resolver, (m) => this.logger.warn(m));
      // Only a definite answer is remembered: a shrug from a broken resolver is asked again next time.
      if (!verdict.ok || verdict.checked) this.cache.set(key, { at: now, verdict });
    }
    if (!verdict.ok) throw new BadRequestException(verdict.message);
  }
}
