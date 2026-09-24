import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/** argon2id with parameters sized for a login endpoint (~100ms on a small VPS). */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain, OPTIONS);
    } catch {
      return false;
    }
  }
}