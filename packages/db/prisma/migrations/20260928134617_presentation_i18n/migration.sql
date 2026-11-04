/*
  Warnings:

  - The `displayName` column on the `category_presentations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `description` column on the `category_presentations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `displayName` column on the `product_presentations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `description` column on the `product_presentations` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "category_presentations" DROP COLUMN "displayName",
ADD COLUMN     "displayName" JSONB,
DROP COLUMN "description",
ADD COLUMN     "description" JSONB;

-- AlterTable
ALTER TABLE "product_presentations" DROP COLUMN "displayName",
ADD COLUMN     "displayName" JSONB,
DROP COLUMN "description",
ADD COLUMN     "description" JSONB;
