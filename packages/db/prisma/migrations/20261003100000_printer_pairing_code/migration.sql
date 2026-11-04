-- A one-time setup code the print helper trades for its token (hash only, expires quickly).
ALTER TABLE "printers" ADD COLUMN "pairingCodeHash" TEXT, ADD COLUMN "pairingExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "printers_pairingCodeHash_key" ON "printers"("pairingCodeHash");
