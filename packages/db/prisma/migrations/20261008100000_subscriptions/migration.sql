-- Subscriptions: periods (chosen by the platform team) during which a restaurant's kiosks take orders.

-- The first sketch of subscriptions (one row per restaurant with plans and trials) was never used: no code reads it
-- and the table is empty. It is replaced by periods, which keep the history.
DROP TABLE IF EXISTS "subscriptions";
DROP TYPE IF EXISTS "SubscriptionStatus";

CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "amount" DECIMAL(12,2),
    "note" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" VARCHAR(500),
    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_periods_dates" CHECK ("endsOn" >= "startsOn")
);
CREATE INDEX "subscription_periods_restaurantId_endsOn_idx" ON "subscription_periods"("restaurantId", "endsOn");
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The restaurants that exist today keep working: a free period until the end of October 2026, which the platform
-- team extends or replaces in each restaurant's Subscription tab.
INSERT INTO "subscription_periods" ("restaurantId", "startsOn", "endsOn", "note", "updatedAt")
SELECT "id", LEAST(CURRENT_DATE, DATE '2026-10-31'), DATE '2026-10-31', 'Free period given when subscriptions started', now()
  FROM "restaurants" WHERE "status" <> 'ARCHIVED';
