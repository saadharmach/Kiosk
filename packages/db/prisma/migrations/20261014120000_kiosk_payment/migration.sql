-- Paying at the kiosk: card on the borne's TPE (the order is sent to unTill closed), or cash.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'DRAFT';
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'FAILED');

ALTER TABLE "restaurant_settings"
  ADD COLUMN "cardPaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cardUntillPaymentId" BIGINT,
  ADD COLUMN "cashPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cashUntillPaymentId" BIGINT,
  ADD COLUMN "cashClosesOrder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders"
  ADD COLUMN "closeInUntill" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "untillPaymentId" BIGINT,
  ADD COLUMN "closedInUntillAt" TIMESTAMP(3);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "restaurantId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "terminalId" UUID,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRef" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_restaurantId_orderId_idx" ON "payments"("restaurantId", "orderId");
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "payment_terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
