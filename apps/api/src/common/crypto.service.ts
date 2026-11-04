import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");
const ALGO = "aes-256-gcm";

export type Sealed = { ciphertext: string; iv: string; authTag: string };

@Injectable()
export class CryptoService {
  /** AES-256-GCM. The auth tag makes tampering detectable, unlike plain CBC. */
  seal(plain: string): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  open(sealed: Sealed): string {
    const decipher = createDecipheriv(ALGO, KEY, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  sealJson(value: unknown): Sealed {
    return this.seal(JSON.stringify(value));
  }

  openJson<T>(sealed: Sealed): T {
    return JSON.parse(this.open(sealed)) as T;
  }
}