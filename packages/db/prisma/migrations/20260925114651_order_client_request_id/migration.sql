/*
  Warnings:

  - A unique constraint covering the columns `[restaurantId,clientRequestId]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "clientRequestId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurantId_clientRequestId_key" ON "orders"("restaurantId", "clientRequestId");
