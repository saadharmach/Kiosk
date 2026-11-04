-- Welcome adverts become slides (a photo or a video, optionally linked to a product), plus a second welcome line.
ALTER TABLE "restaurants" ADD COLUMN "welcomeSlides" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "restaurants" ADD COLUMN "subtitle" JSONB;
UPDATE "restaurants"
   SET "welcomeSlides" = (SELECT COALESCE(jsonb_agg(jsonb_build_object('path', p, 'productId', NULL) ORDER BY o), '[]'::jsonb)
                            FROM unnest("welcomeImagePaths") WITH ORDINALITY AS t(p, o));
ALTER TABLE "restaurants" DROP COLUMN "welcomeImagePaths";
