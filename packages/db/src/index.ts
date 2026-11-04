// unTill IDs are BigInt. Without this, any JSON response containing one throws.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};


import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __kioskPrisma: PrismaClient | undefined;
}

/** Single shared client. Reused across hot reloads in development. */
export const prisma: PrismaClient =
  globalThis.__kioskPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalThis.__kioskPrisma = prisma;

export * from "@prisma/client";