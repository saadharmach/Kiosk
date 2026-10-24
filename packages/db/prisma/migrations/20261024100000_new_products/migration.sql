-- A product can be marked new, with an optional last day.
ALTER TABLE "product_presentations" ADD COLUMN "isNew" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "newUntil" DATE;
