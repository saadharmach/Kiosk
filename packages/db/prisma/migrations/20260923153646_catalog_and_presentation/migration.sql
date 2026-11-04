-- CreateEnum
CREATE TYPE "PresentationScope" AS ENUM ('GROUP', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('EAT_IN', 'TAKE_AWAY', 'DELIVERY');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'STARTUP');

-- CreateTable
CREATE TABLE "tpapi_sales_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priceLevelId" BIGINT,
    "tableRanges" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_sales_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_price_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "hqId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_price_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "hqId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" BIGINT,
    "hqId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" BIGINT,
    "supplementOptionId" BIGINT,
    "condimentOptionId" BIGINT,
    "availableSalesAreaIds" BIGINT[],
    "hqId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" BIGINT,
    "availableSalesAreaIds" BIGINT[],
    "isMenu" BOOLEAN NOT NULL DEFAULT false,
    "isManualPrice" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "promo" BOOLEAN NOT NULL DEFAULT false,
    "plu" TEXT,
    "courseId" BIGINT,
    "sizeModifierId" BIGINT,
    "externalId" TEXT,
    "hqId" TEXT,
    "rawExtra" JSONB NOT NULL DEFAULT '[]',
    "isPresent" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_article_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "priceLevelId" BIGINT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "vat" DECIMAL(6,3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_article_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_article_size_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "priceLevelId" BIGINT NOT NULL,
    "sizeItemId" BIGINT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_article_size_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_article_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "optionGroupId" BIGINT NOT NULL,
    "requiredChoices" INTEGER,
    "isFreeOption" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_article_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_option_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "availableSalesAreaIds" BIGINT[],
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_option_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "optionGroupId" BIGINT NOT NULL,
    "articleId" BIGINT NOT NULL,
    "priceLevelId" BIGINT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "vat" DECIMAL(6,3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_option_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_size_modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_size_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_size_modifier_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "sizeModifierId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_size_modifier_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "separate" BOOLEAN NOT NULL DEFAULT false,
    "autoFire" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_printers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "guid" TEXT,
    "nullPrinter" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpapi_allergens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "untillId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tpapi_allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_presentations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "imagePath" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "badgeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_presentations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "scope" "PresentationScope" NOT NULL,
    "untillId" BIGINT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "imagePath" TEXT,
    "color" VARCHAR(9),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_allergens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "articleId" BIGINT NOT NULL,
    "allergenId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_type_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "salesAreaId" BIGINT NOT NULL,
    "fixedTableNumber" INTEGER,
    "tableRangeFrom" INTEGER,
    "tableRangeTo" INTEGER,
    "tablePart" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_type_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" "SyncTrigger" NOT NULL DEFAULT 'MANUAL',
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tpapi_sales_areas_restaurantId_idx" ON "tpapi_sales_areas"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_sales_areas_restaurantId_untillId_key" ON "tpapi_sales_areas"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_price_levels_restaurantId_idx" ON "tpapi_price_levels"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_price_levels_restaurantId_untillId_key" ON "tpapi_price_levels"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_categories_restaurantId_idx" ON "tpapi_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_categories_restaurantId_untillId_key" ON "tpapi_categories"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_groups_restaurantId_idx" ON "tpapi_groups"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_groups_restaurantId_untillId_key" ON "tpapi_groups"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_departments_restaurantId_idx" ON "tpapi_departments"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_departments_restaurantId_untillId_key" ON "tpapi_departments"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_articles_restaurantId_departmentId_idx" ON "tpapi_articles"("restaurantId", "departmentId");

-- CreateIndex
CREATE INDEX "tpapi_articles_restaurantId_isPresent_idx" ON "tpapi_articles"("restaurantId", "isPresent");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_articles_restaurantId_untillId_key" ON "tpapi_articles"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_article_prices_restaurantId_articleId_idx" ON "tpapi_article_prices"("restaurantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_article_prices_restaurantId_articleId_priceLevelId_key" ON "tpapi_article_prices"("restaurantId", "articleId", "priceLevelId");

-- CreateIndex
CREATE INDEX "tpapi_article_size_prices_restaurantId_articleId_idx" ON "tpapi_article_size_prices"("restaurantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_article_size_prices_restaurantId_articleId_priceLevel_key" ON "tpapi_article_size_prices"("restaurantId", "articleId", "priceLevelId", "sizeItemId");

-- CreateIndex
CREATE INDEX "tpapi_article_options_restaurantId_articleId_idx" ON "tpapi_article_options"("restaurantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_article_options_restaurantId_articleId_optionGroupId_key" ON "tpapi_article_options"("restaurantId", "articleId", "optionGroupId");

-- CreateIndex
CREATE INDEX "tpapi_option_groups_restaurantId_idx" ON "tpapi_option_groups"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_option_groups_restaurantId_untillId_key" ON "tpapi_option_groups"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_option_items_restaurantId_optionGroupId_idx" ON "tpapi_option_items"("restaurantId", "optionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_option_items_restaurantId_optionGroupId_articleId_pri_key" ON "tpapi_option_items"("restaurantId", "optionGroupId", "articleId", "priceLevelId");

-- CreateIndex
CREATE INDEX "tpapi_size_modifiers_restaurantId_idx" ON "tpapi_size_modifiers"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_size_modifiers_restaurantId_untillId_key" ON "tpapi_size_modifiers"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_size_modifier_items_restaurantId_sizeModifierId_idx" ON "tpapi_size_modifier_items"("restaurantId", "sizeModifierId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_size_modifier_items_restaurantId_untillId_key" ON "tpapi_size_modifier_items"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_courses_restaurantId_idx" ON "tpapi_courses"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_courses_restaurantId_untillId_key" ON "tpapi_courses"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_payments_restaurantId_idx" ON "tpapi_payments"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_payments_restaurantId_untillId_key" ON "tpapi_payments"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_printers_restaurantId_idx" ON "tpapi_printers"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_printers_restaurantId_untillId_key" ON "tpapi_printers"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "tpapi_allergens_restaurantId_idx" ON "tpapi_allergens"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "tpapi_allergens_restaurantId_untillId_key" ON "tpapi_allergens"("restaurantId", "untillId");

-- CreateIndex
CREATE INDEX "product_presentations_restaurantId_isVisible_idx" ON "product_presentations"("restaurantId", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_restaurantId_articleId_key" ON "product_presentations"("restaurantId", "articleId");

-- CreateIndex
CREATE INDEX "category_presentations_restaurantId_scope_idx" ON "category_presentations"("restaurantId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "category_presentations_restaurantId_scope_untillId_key" ON "category_presentations"("restaurantId", "scope", "untillId");

-- CreateIndex
CREATE INDEX "product_allergens_restaurantId_articleId_idx" ON "product_allergens"("restaurantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "product_allergens_restaurantId_articleId_allergenId_key" ON "product_allergens"("restaurantId", "articleId", "allergenId");

-- CreateIndex
CREATE INDEX "order_type_mappings_restaurantId_idx" ON "order_type_mappings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_type_mappings_restaurantId_orderType_key" ON "order_type_mappings"("restaurantId", "orderType");

-- CreateIndex
CREATE INDEX "sync_runs_restaurantId_startedAt_idx" ON "sync_runs"("restaurantId", "startedAt");
