-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'SENT', 'CONFIRMED', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAY_AT_CASHIER', 'PAYMENT_TERMINAL');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('PRODUCT', 'SIZE', 'OPTION', 'SUPPLEMENT', 'MENU_CHOICE', 'REMOVAL', 'TEXT');

-- CreateEnum
CREATE TYPE "OrderActor" AS ENUM ('KIOSK', 'SYSTEM', 'RESTAURANT_USER', 'PLATFORM_USER');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "kioskId" UUID,
    "reference" VARCHAR(20) NOT NULL,
    "businessDate" DATE NOT NULL,
    "dailySequence" INTEGER NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAY_AT_CASHIER',
    "salesAreaId" BIGINT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "tablePart" TEXT NOT NULL DEFAULT '',
    "priceLevelId" BIGINT NOT NULL,
    "covers" INTEGER NOT NULL DEFAULT 1,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(12,4) NOT NULL,
    "taxTotal" DECIMAL(12,4) NOT NULL,
    "total" DECIMAL(12,4) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "customerName" TEXT,
    "customerNote" TEXT,
    "tpapiAttempts" INTEGER NOT NULL DEFAULT 0,
    "tpapiCorrelationId" TEXT,
    "tpapiReturnCode" INTEGER,
    "tpapiLastError" TEXT,
    "tpapiRequestSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "paidDetectedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "parentLineNumber" INTEGER,
    "kind" "OrderItemKind" NOT NULL DEFAULT 'PRODUCT',
    "articleId" BIGINT,
    "articleName" TEXT NOT NULL,
    "displayName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(12,4) NOT NULL,
    "vatRate" DECIMAL(6,3),
    "sizeItemId" BIGINT,
    "sizeName" TEXT,
    "optionGroupId" BIGINT,
    "optionGroupName" TEXT,
    "text" TEXT,
    "untillOrderItemType" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actor" "OrderActor" NOT NULL DEFAULT 'SYSTEM',
    "actorId" UUID,
    "reason" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_restaurantId_createdAt_idx" ON "orders"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_restaurantId_status_idx" ON "orders"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "orders_restaurantId_businessDate_idx" ON "orders"("restaurantId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurantId_reference_key" ON "orders"("restaurantId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurantId_businessDate_dailySequence_key" ON "orders"("restaurantId", "businessDate", "dailySequence");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_restaurantId_articleId_idx" ON "order_items"("restaurantId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_lineNumber_key" ON "order_items"("orderId", "lineNumber");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_history_restaurantId_createdAt_idx" ON "order_status_history"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_counters_restaurantId_businessDate_key" ON "order_counters"("restaurantId", "businessDate");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
