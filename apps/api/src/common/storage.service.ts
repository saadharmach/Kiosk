import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, PayloadTooLargeException } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** A photo bigger than this is refused; a kiosk never needs more. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** How long a signed upload address works. */
export const UPLOAD_TTL_SEC = 300;
/** Where the files are served: nginx reads them straight from disk in production, the API in development. */
export const MEDIA_URL_PREFIX = "/api/media/files";

/** The only shape a stored file's path may have. Anything else (a "..", an absolute path) is not ours. */
const PATH_RE = /^restaurants\/[0-9a-f-]{36}\/(products|categories|branding)\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;
export const isMediaPath = (p: string) => PATH_RE.test(p);

/** What the first bytes of a file say it is, whatever its name or the browser claims. */
export function sniffImageType(head: Buffer): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.length >= 12 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp" && ["avif", "avis"].includes(head.toString("latin1", 8, 12))) return "image/avif";
  return null;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/**
 * Photos and logos on the server's own disk. The browser uploads straight to a short-lived signed address on
 * this API (like a cloud bucket would give), and the files are then served as plain static files.
 *
 * Settings: MEDIA_DIR (the folder; default ./.media), JWT_SECRET (the signing key is derived from it).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  get dir(): string {
    return path.resolve(process.env.MEDIA_DIR || ".media");
  }

  private key(): Buffer {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");
    // Its own key, so an upload token can never pass for anything else signed with the same secret.
    return createHmac("sha256", secret).update("media-upload-v1").digest();
  }

  private sign(payload: { p: string; t: string; e: number }): string {
    const body = b64(JSON.stringify(payload));
    return `${body}.${b64(createHmac("sha256", this.key()).update(body).digest())}`;
  }

  private verify(token: string): { p: string; t: string; e: number } {
    const [body, sig] = token.split(".");
    if (!body || !sig) throw new ForbiddenException("This upload address is not valid");
    const expected = createHmac("sha256", this.key()).update(body).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ForbiddenException("This upload address is not valid");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p: string; t: string; e: number };
    if (Date.now() / 1000 > payload.e) throw new ForbiddenException("This upload address has expired: try again");
    return payload;
  }

  /** The file's place on disk, or null for a path that is not one of ours. */
  private resolve(p: string): string | null {
    if (!isMediaPath(p)) return null;
    const full = path.join(this.dir, p);
    return full.startsWith(this.dir + path.sep) ? full : null;
  }

  /** A path the browser can load. Relative, so it works on every site that passes /api to this API. */
  publicUrl(p: string | null): string | null {
    return p ? `${MEDIA_URL_PREFIX}/${p}` : null;
  }

  async signUpload(params: { restaurantId: string; kind: "products" | "categories" | "branding"; ownerId: string; contentType: string }) {
    const ext = ALLOWED[params.contentType];
    if (!ext) {
      throw new BadRequestException(`Unsupported image type "${params.contentType}". Allowed: ${Object.keys(ALLOWED).join(", ")}`);
    }
    // The UUID makes the path unguessable and makes every upload a new URL,
    // so a replaced image is never served from a stale cache.
    const p = `restaurants/${params.restaurantId}/${params.kind}/${params.ownerId}/${randomUUID()}.${ext}`;
    if (!isMediaPath(p)) throw new BadRequestException("That cannot be stored");
    const token = this.sign({ p, t: params.contentType, e: Math.floor(Date.now() / 1000) + UPLOAD_TTL_SEC });
    return {
      uploadUrl: `/api/media/upload/${token}`,
      method: "PUT" as const,
      contentType: params.contentType,
      path: p,
      publicUrl: this.publicUrl(p),
      expiresInSec: UPLOAD_TTL_SEC,
    };
  }

  /**
   * Receives an upload sent to a signed address. Written to a temporary file and renamed into place only when it
   * is complete, small enough, and really the image type it was signed for.
   */
  async receive(token: string, contentType: string, body: Readable, declaredLength?: number): Promise<{ path: string; size: number }> {
    const { p, t } = this.verify(token);
    if (contentType.split(";")[0]!.trim().toLowerCase() !== t) throw new BadRequestException(`This address expects ${t}`);
    if (declaredLength !== undefined && declaredLength > MAX_IMAGE_BYTES) throw new PayloadTooLargeException("The photo is too big (8 MB at most)");
    const full = this.resolve(p);
    if (!full) throw new BadRequestException("That cannot be stored");
    if (await stat(full).then(() => true, () => false)) throw new ConflictException("This upload address was already used");

    await mkdir(path.dirname(full), { recursive: true });
    const temp = `${full}.part-${randomUUID()}`;
    let size = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.length;
        done(size > MAX_IMAGE_BYTES ? new PayloadTooLargeException("The photo is too big (8 MB at most)") : null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(temp, { flags: "wx", mode: 0o644 }));
      const fh = await open(temp, "r");
      const head = Buffer.alloc(16);
      try { await fh.read(head, 0, 16, 0); } finally { await fh.close(); }
      if (sniffImageType(head) !== t) throw new BadRequestException("That file is not the image it claims to be");
      await rename(temp, full);
      return { path: p, size };
    } catch (e) {
      await unlink(temp).catch(() => undefined);
      throw e;
    }
  }

  /** Size in bytes of a stored file, or null if it is missing (or not one of ours). */
  async objectSize(p: string): Promise<number | null> {
    const full = this.resolve(p);
    if (!full) return null;
    return stat(full).then((s) => (s.isFile() ? s.size : null), () => null);
  }

  /** Best effort: a failed delete leaves an orphan file, never a broken record. */
  async remove(p: string | null): Promise<void> {
    if (!p) return;
    const full = this.resolve(p);
    if (!full) return void this.logger.warn(`Not deleting ${p}: not a media path`);
    await unlink(full).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") this.logger.warn(`Could not delete ${p}: ${e.message}`);
    });
  }
}
