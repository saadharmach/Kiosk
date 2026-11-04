-- AlterTable
ALTER TABLE "restaurant_users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "restaurant_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_sessions_tokenHash_key" ON "restaurant_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "restaurant_sessions_restaurantId_userId_idx" ON "restaurant_sessions"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "restaurant_sessions_userId_expiresAt_idx" ON "restaurant_sessions"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "restaurant_sessions" ADD CONSTRAINT "restaurant_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "restaurant_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
