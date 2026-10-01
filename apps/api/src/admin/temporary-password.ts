import { randomInt } from "node:crypto";

/** No 0/O, 1/l/I: a password read out loud or copied by hand must survive being misread. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A 16-character random password, about 91 bits. Shown once to the platform user, who passes it on. */
export function generateTemporaryPassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
