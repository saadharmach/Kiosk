import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@kiosk/db";

/** How long a transaction may wait for a connection, and how long it may run. */
export const TX_MAX_WAIT_MS = 15_000;
export const TX_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma kills any interactive transaction that runs longer than 5 seconds ("Transaction not found", P2028).
    // Saving an order is about eight queries in a row inside one, so on a database that answers in a second
    // or two that is enough to fail the customer's order. These limits leave real headroom.
    super({ log: ["warn", "error"], transactionOptions: { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}