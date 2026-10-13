import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { TpapiTransport } from "@kiosk/tpapi";
import { PAIRING_TTL_MIN, newPairingCode, normalizePairingCode } from "../printing/printing.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A bridge asks for work continuously (each request held open up to 25 s): silent longer than this, it is not running. */
export const BRIDGE_ONLINE_MS = 60_000;
/** Calls handed to the bridge in one answer: it runs them side by side. */
const BATCH = 10;
/** Extra time over the call's own timeout, for the trip to the restaurant and back. */
const TRIP_MS = 10_000;
/** The bridge's sign of life is written at most this often (it asks all the time). */
const BEAT_MS = 15_000;

/** What the bridge is given: the full request for the till. The till's answer comes back gzip-compressed. */
export interface BridgeJob { id: string; url: string; soapAction: string; body: string; timeoutMs: number }
export interface BridgeConn { id: string; restaurantId: string; bridgeLastSeenAt: Date | null }
export type BridgeResult =
  | { ok: true; status: number; statusText?: string; textGzipBase64: string }
  | { ok: false; error: string };

interface Waiting { restaurantId: string; resolve: (r: { status: number; statusText: string; text: string }) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

/**
 * Reaches a till that the internet cannot: the restaurant runs the helper program in bridge mode, which connects out
 * to us, collects the SOAP calls waiting for its till (held-open requests, like the print helper's tickets), runs them on
 * the restaurant's network and sends back the answers. Nothing is stored: a call lives in memory only for its few
 * seconds (one API process; a restart just fails the calls in flight, which their callers already retry).
 */
@Injectable()
export class TillBridgeService {
  private readonly logger = new Logger(TillBridgeService.name);
  private readonly queues = new Map<string, BridgeJob[]>();
  private readonly waiting = new Map<string, Waiting>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly seen = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** The way a TpapiClient sends its calls for this restaurant. */
  transport(restaurantId: string): TpapiTransport {
    return (req) => this.send(restaurantId, req);
  }

  /** Has the bridge asked for work lately? */
  isOnline(restaurantId: string, lastSeenAt?: Date | null, now = Date.now()): boolean {
    const t = Math.max(this.seen.get(restaurantId) ?? 0, lastSeenAt?.getTime() ?? 0);
    return now - t <= BRIDGE_ONLINE_MS;
  }

  send(restaurantId: string, req: { url: string; soapAction: string; body: string; timeoutMs: number }) {
    if (!this.isOnline(restaurantId)) {
      return Promise.reject(new Error("The bridge at the restaurant is not running (it has not asked for work in the last minute)"));
    }
    const job: BridgeJob = { id: randomUUID(), url: req.url, soapAction: req.soapAction, body: req.body, timeoutMs: req.timeoutMs };
    return new Promise<{ status: number; statusText: string; text: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(job.id);
        const q = this.queues.get(restaurantId);
        if (q) this.queues.set(restaurantId, q.filter((j) => j.id !== job.id));
        reject(new Error(`The bridge at the restaurant did not answer within ${Math.round((req.timeoutMs + TRIP_MS) / 1000)} s`));
      }, req.timeoutMs + TRIP_MS);
      timer.unref?.();
      this.waiting.set(job.id, { restaurantId, resolve, reject, timer });
      this.queues.set(restaurantId, [...(this.queues.get(restaurantId) ?? []), job]);
      for (const wake of [...(this.listeners.get(restaurantId) ?? [])]) wake();
    });
  }

  /**
   * The bridge asks for work. Held open up to `waitMs` until a call arrives, so a call reaches the restaurant at once.
   * Being asked is its sign of life.
   */
  async next(conn: BridgeConn, waitMs: number, signal?: AbortSignal): Promise<{ jobs: BridgeJob[] }> {
    await this.beat(conn);
    const deadline = Date.now() + waitMs;
    let jobs = this.take(conn.restaurantId);
    while (jobs.length === 0 && !signal?.aborted && Date.now() < deadline) {
      await this.listen(conn.restaurantId, deadline - Date.now(), signal);
      await this.beat(conn);
      jobs = this.take(conn.restaurantId);
    }
    return { jobs };
  }

  /** The till's answer for one call. Only a call of this bridge's own restaurant can be answered. */
  reply(conn: BridgeConn, jobId: string, result: BridgeResult): { ok: true } {
    const w = this.waiting.get(jobId);
    if (!w || w.restaurantId !== conn.restaurantId) return { ok: true }; // timed out already, or not ours: nothing to do
    this.waiting.delete(jobId);
    clearTimeout(w.timer);
    if (!result.ok) {
      w.reject(new Error(`At the restaurant: ${result.error}`));
      return { ok: true };
    }
    let text: string;
    try {
      text = gunzipSync(Buffer.from(result.textGzipBase64, "base64")).toString("utf8");
    } catch {
      w.reject(new Error("The bridge sent an answer that could not be read"));
      return { ok: true };
    }
    w.resolve({ status: result.status, statusText: result.statusText ?? "", text });
    return { ok: true };
  }

  private take(restaurantId: string): BridgeJob[] {
    const q = this.queues.get(restaurantId) ?? [];
    if (q.length === 0) return [];
    const jobs = q.slice(0, BATCH);
    const rest = q.slice(BATCH);
    if (rest.length) this.queues.set(restaurantId, rest);
    else this.queues.delete(restaurantId);
    return jobs;
  }

  private listen(restaurantId: string, ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const set = this.listeners.get(restaurantId) ?? new Set<() => void>();
      this.listeners.set(restaurantId, set);
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        set.delete(done);
        if (set.size === 0) this.listeners.delete(restaurantId);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      set.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  private async beat(conn: BridgeConn) {
    const now = Date.now();
    const was = Math.max(this.seen.get(conn.restaurantId) ?? 0, conn.bridgeLastSeenAt?.getTime() ?? 0);
    this.seen.set(conn.restaurantId, now);
    if (now - was < BEAT_MS) return;
    if (now - was > BRIDGE_ONLINE_MS) this.logger.log(`Bridge of ${conn.restaurantId} is connected`);
    conn.bridgeLastSeenAt = new Date(now);
    await this.prisma.tpapiConnection.updateMany({ where: { id: conn.id, restaurantId: conn.restaurantId }, data: { bridgeLastSeenAt: new Date(now) } });
  }

  // ------------------------------------------------------- signing in and setting up

  authenticate(token: string): Promise<BridgeConn | null> {
    return this.prisma.tpapiConnection.findUnique({
      where: { bridgeTokenHash: sha256(token) },
      select: { id: true, restaurantId: true, bridgeLastSeenAt: true },
    });
  }

  /** A one-time code for setting the bridge up (shown once in the admin; only its hash is kept). */
  async issuePairingCode(restaurantId: string) {
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MIN * 60_000);
    const r = await this.prisma.tpapiConnection.updateMany({
      where: { restaurantId },
      data: { bridgePairingCodeHash: sha256(normalizePairingCode(code)!), bridgePairingExpiresAt: expiresAt },
    });
    if (r.count !== 1) throw new BadRequestException("Save the till connection first, then set up the bridge.");
    return { code, expiresAt };
  }

  /** The bridge trades its code for its secret. A wrong, used or expired code all get the same answer. */
  async redeemPairingCode(input: string) {
    const bad = () => new BadRequestException("This setup code is not valid (it may have expired or been used). Get a new one in the admin.");
    const code = normalizePairingCode(input);
    if (!code) throw bad();
    const hash = sha256(code);
    const conn = await this.prisma.tpapiConnection.findUnique({ where: { bridgePairingCodeHash: hash }, select: { id: true, restaurantId: true, host: true, port: true } });
    if (!conn) throw bad();
    const token = `tbr_${randomBytes(32).toString("base64url")}`;
    // One atomic step: two bridges racing with the same code cannot both win. It replaces any earlier bridge's secret.
    const won = await this.prisma.tpapiConnection.updateMany({
      where: { id: conn.id, restaurantId: conn.restaurantId, bridgePairingCodeHash: hash, bridgePairingExpiresAt: { gt: new Date() } },
      data: { bridgePairingCodeHash: null, bridgePairingExpiresAt: null, bridgeTokenHash: sha256(token), bridgeTokenIssuedAt: new Date() },
    });
    if (won.count !== 1) throw bad();
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: conn.restaurantId }, select: { name: true } });
    return { token, bridgeId: conn.id, label: `${restaurant.name} - till`, tillHost: conn.host, tillPort: conn.port };
  }
}
