import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaService, TX_MAX_WAIT_MS, TX_TIMEOUT_MS } from "../src/prisma/prisma.service.js";

describe("PrismaService", () => {
  it("does not use Prisma's 5 second transaction limit, which cancelled customers' orders on a slow connection", () => {
    assert.ok(TX_TIMEOUT_MS >= 20_000, "a transaction may run at least 20s");
    assert.ok(TX_MAX_WAIT_MS >= 10_000, "and wait at least 10s for a connection");
  });

  it("really hands those limits to the Prisma client", () => {
    process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";
    const svc = new PrismaService() as unknown as { _originalClient: { _engineConfig: { transactionOptions: { timeout: number; maxWait: number } } } };
    const opts = svc._originalClient._engineConfig.transactionOptions;
    assert.equal(opts.timeout, TX_TIMEOUT_MS);
    assert.equal(opts.maxWait, TX_MAX_WAIT_MS);
  });
});
