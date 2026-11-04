-- CreateEnum
CREATE TYPE "AccountTokenKind" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "AccountRealm" AS ENUM ('PLATFORM', 'RESTAURANT');

-- AlterTable
ALTER TABLE "platform_users" ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "restaurant_users" ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- Everyone who exists already chose (or was given) a working password: they are not waiting for an invitation.
UPDATE "platform_users" SET "passwordSetAt" = "createdAt" WHERE "passwordSetAt" IS NULL;
UPDATE "restaurant_users" SET "passwordSetAt" = "createdAt" WHERE "passwordSetAt" IS NULL;

-- CreateTable
CREATE TABLE "account_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "realm" "AccountRealm" NOT NULL,
    "kind" "AccountTokenKind" NOT NULL,
    "userId" UUID NOT NULL,
    "restaurantId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tokens_tokenHash_key" ON "account_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "account_tokens_realm_userId_idx" ON "account_tokens"("realm", "userId");
