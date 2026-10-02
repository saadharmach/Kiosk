-- A borne has at most one printer. Printers with no borne (the restaurant's default) are unaffected: NULLs never collide.
-- DropIndex
DROP INDEX IF EXISTS "printers_kioskId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "printers_kioskId_key" ON "printers"("kioskId");
