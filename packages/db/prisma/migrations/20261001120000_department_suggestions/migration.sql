-- CreateTable
CREATE TABLE "department_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurantId" UUID NOT NULL,
    "departmentId" BIGINT NOT NULL,
    "articleId" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_suggestions_restaurantId_departmentId_idx" ON "department_suggestions"("restaurantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "department_suggestions_restaurantId_departmentId_articleId_key" ON "department_suggestions"("restaurantId", "departmentId", "articleId");
