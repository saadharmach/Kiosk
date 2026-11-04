-- The single welcome photo becomes a list of photos shown in turn (offers, adverts). The existing photo is kept as the first.
ALTER TABLE "restaurants" ADD COLUMN "welcomeImagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "restaurants" SET "welcomeImagePaths" = ARRAY["heroImagePath"] WHERE "heroImagePath" IS NOT NULL;
ALTER TABLE "restaurants" DROP COLUMN "heroImagePath";
