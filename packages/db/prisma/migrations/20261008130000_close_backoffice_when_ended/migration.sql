-- Per restaurant: close the back office too when no subscription period is running (off for everyone at first).
ALTER TABLE "restaurants" ADD COLUMN "closeBackofficeWhenEnded" BOOLEAN NOT NULL DEFAULT false;
