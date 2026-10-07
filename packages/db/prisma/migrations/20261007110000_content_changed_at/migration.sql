-- Kiosks reload what they show when this moves (any change in the back office or admin, a menu sync).
ALTER TABLE "restaurants" ADD COLUMN "contentChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
