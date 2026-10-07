-- From now on a product that arrives from unTill is hidden until the restaurant shows it.
-- Products that exist today keep what they had: those without a presentation row were shown (the old default),
-- so they get one that says so, before the default changes.
INSERT INTO "product_presentations" ("restaurantId", "articleId", "isVisible", "updatedAt")
SELECT a."restaurantId", a."untillId", true, now()
  FROM "tpapi_articles" a
 WHERE NOT EXISTS (SELECT 1 FROM "product_presentations" p WHERE p."restaurantId" = a."restaurantId" AND p."articleId" = a."untillId")
ON CONFLICT ("restaurantId", "articleId") DO NOTHING;

ALTER TABLE "product_presentations" ALTER COLUMN "isVisible" SET DEFAULT false;
