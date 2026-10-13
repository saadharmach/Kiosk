-- A till that cannot be reached from the internet is reached through the bridge program at the restaurant.
CREATE TYPE "TillRoute" AS ENUM ('DIRECT', 'BRIDGE');
ALTER TABLE "tpapi_connections" ADD COLUMN "route" "TillRoute" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "tpapi_connections" ADD COLUMN "bridgeTokenHash" TEXT;
ALTER TABLE "tpapi_connections" ADD COLUMN "bridgeTokenIssuedAt" TIMESTAMP(3);
ALTER TABLE "tpapi_connections" ADD COLUMN "bridgePairingCodeHash" TEXT;
ALTER TABLE "tpapi_connections" ADD COLUMN "bridgePairingExpiresAt" TIMESTAMP(3);
ALTER TABLE "tpapi_connections" ADD COLUMN "bridgeLastSeenAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "tpapi_connections_bridgeTokenHash_key" ON "tpapi_connections"("bridgeTokenHash");
CREATE UNIQUE INDEX "tpapi_connections_bridgePairingCodeHash_key" ON "tpapi_connections"("bridgePairingCodeHash");
