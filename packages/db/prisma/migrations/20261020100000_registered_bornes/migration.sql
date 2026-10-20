-- A borne's screen is registered once with a one-time code; the restaurant can require it.
ALTER TABLE "kiosks" ADD COLUMN "registrationCodeHash" TEXT, ADD COLUMN "registrationExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "kiosks_registrationCodeHash_key" ON "kiosks"("registrationCodeHash");
ALTER TABLE "restaurant_settings" ADD COLUMN "requireRegisteredBornes" BOOLEAN NOT NULL DEFAULT false;
