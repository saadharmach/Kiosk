-- The server pings each till regularly; kiosks stop while it does not answer.
ALTER TABLE "tpapi_connections" ADD COLUMN "pingFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tpapi_connections" ADD COLUMN "unreachableSince" TIMESTAMP(3);
