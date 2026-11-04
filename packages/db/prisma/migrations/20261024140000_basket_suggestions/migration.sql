-- The basket's own suggestions, whatever is in the basket.
-- CreateTable
CREATE TABLE "basket_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "basket_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "basket_suggestions_restaurantId_idx" ON "basket_suggestions"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "basket_suggestions_restaurantId_articleId_key" ON "basket_suggestions"("restaurantId", "articleId");

