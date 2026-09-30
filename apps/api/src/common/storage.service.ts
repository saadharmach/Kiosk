import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Supabase Storage over its REST API. No SDK: the two calls we need are a signed
 * upload URL and a delete, and the browser uploads straight to Supabase — image
 * bytes never pass through this API.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private get base(): string {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new InternalServerErrorException("SUPABASE_URL is not configured");
    return url.replace(/\/+$/, "");
  }

  private get key(): string {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new InternalServerErrorException("SUPABASE_SECRET_KEY is not configured");
    return key;
  }

  private get bucket(): string {
    return process.env.SUPABASE_MEDIA_BUCKET || "restaurant-media";
  }

  /** A public bucket, so this is a stable CDN URL the kiosk can cache. */
  publicUrl(path: string | null): string | null {
    if (!path) return null;
    return `${this.base}/storage/v1/object/public/${this.bucket}/${path}`;
  }

  async signUpload(params: { restaurantId: string; kind: "products" | "categories" | "branding"; ownerId: string; contentType: string }) {
    const ext = ALLOWED[params.contentType];
    if (!ext) {
      throw new BadRequestException(
        `Unsupported image type "${params.contentType}". Allowed: ${Object.keys(ALLOWED).join(", ")}`,
      );
    }
    // The UUID makes the path unguessable and makes every upload a new URL,
    // so a replaced image is never served from a stale cache.
    const path = `restaurants/${params.restaurantId}/${params.kind}/${params.ownerId}/${randomUUID()}.${ext}`;

    const res = await fetch(`${this.base}/storage/v1/object/upload/sign/${this.bucket}/${path}`, {
      method: "POST",
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`Sign upload failed ${res.status}: ${detail}`);
      throw new InternalServerErrorException("Could not prepare the image upload");
    }
    const body = (await res.json()) as { url?: string };
    if (!body.url) throw new InternalServerErrorException("Storage returned no upload URL");

    return {
      uploadUrl: `${this.base}/storage/v1${body.url}`,
      method: "PUT" as const,
      contentType: params.contentType,
      path,
      publicUrl: this.publicUrl(path),
      expiresInSec: 300,
    };
  }

  /** Size in bytes of a stored object, or null if it is missing. A HEAD on the public URL. */
  async objectSize(path: string): Promise<number | null> {
    const res = await fetch(this.publicUrl(path)!, { method: "HEAD" }).catch(() => null);
    if (!res || !res.ok) return null;
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) ? n : null;
  }

  /** Best effort: a failed delete leaves an orphan file, never a broken record. */
  async remove(path: string | null): Promise<void> {
    if (!path) return;
    try {
      const res = await fetch(`${this.base}/storage/v1/object/${this.bucket}/${path}`, {
        method: "DELETE",
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
      });
      if (!res.ok) this.logger.warn(`Could not delete ${path}: ${res.status}`);
    } catch (e) {
      this.logger.warn(`Could not delete ${path}: ${String(e)}`);
    }
  }
}