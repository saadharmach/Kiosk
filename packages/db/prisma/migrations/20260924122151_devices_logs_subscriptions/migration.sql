-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('KIOSK', 'PRINTER', 'PAYMENT_TERMINAL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PROVISIONING', 'ONLINE', 'OFFLINE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PrinterKind" AS ENUM ('RECEIPT', 'KITCHEN', 'LABEL');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('NETWORK', 'USB', 'SERIAL', 'BLUETOOTH', 'UNTILL');

-- CreateEnum
CREATE TYPE "DeviceEventType" AS ENUM ('CREATED', 'CONNECTED', 'DISCONNECTED', 'HEARTBEAT_MISSED', 'CONFIG_CHANGED', 'SOFTWARE_UPDATED', 'ERROR', 'RECOVERED');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('TPAPI', 'PRINTER', 'PAYMENT_TERMINAL', 'KIOSK');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('PLATFORM_USER', 'RESTAURANT_USER', 'SYSTEM', 'KIOSK');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "kiosks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tokenHash" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenRevokedAt" TIMESTAMP(3),
    "salesAreaId" BIGINT,
    "defaultOrderType" "OrderType",
    "appVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "kioskId" UUID,
    "name" TEXT NOT NULL,
    "kind" "PrinterKind" NOT NULL DEFAULT 'RECEIPT',
    "connection" "PrinterConnection" NOT NULL DEFAULT 'NETWORK',
    "address" TEXT,
    "port" INTEGER,
    "untillPrinterId" BIGINT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terminals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "kioskId" UUID,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "serialNumber" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "deviceKind" "DeviceKind" NOT NULL,
    "deviceId" UUID NOT NULL,
    "type" "DeviceEventType" NOT NULL,
    "message" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "kind" "IntegrationKind" NOT NULL DEFAULT 'TPAPI',
    "operation" TEXT,
    "correlationId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "httpStatus" INTEGER,
    "returnCode" INTEGER,
    "message" TEXT,
    "durationMs" INTEGER,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "orderId" UUID,
    "kioskId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" UUID,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "maxKiosks" INTEGER,
    "maxOrdersPerMonth" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosks_tokenHash_key" ON "kiosks"("tokenHash");

-- CreateIndex
CREATE INDEX "kiosks_restaurantId_status_idx" ON "kiosks"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "kiosks_restaurantId_code_key" ON "kiosks"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "printers_restaurantId_status_idx" ON "printers"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "printers_kioskId_idx" ON "printers"("kioskId");

-- CreateIndex
CREATE INDEX "payment_terminals_restaurantId_status_idx" ON "payment_terminals"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "device_events_restaurantId_createdAt_idx" ON "device_events"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "device_events_deviceKind_deviceId_createdAt_idx" ON "device_events"("deviceKind", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "integration_logs_restaurantId_createdAt_idx" ON "integration_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "integration_logs_restaurantId_ok_createdAt_idx" ON "integration_logs"("restaurantId", "ok", "createdAt");

-- CreateIndex
CREATE INDEX "integration_logs_correlationId_idx" ON "integration_logs"("correlationId");

-- CreateIndex
CREATE INDEX "integration_logs_orderId_idx" ON "integration_logs"("orderId");

-- CreateIndex
CREATE INDEX "audit_logs_restaurantId_createdAt_idx" ON "audit_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_restaurantId_key" ON "subscriptions"("restaurantId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "kiosks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosks" ADD CONSTRAINT "kiosks_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "kiosks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "kiosks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
