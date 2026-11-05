-- A USB printer is a Windows printer on the helper's computer: the helper reports the ones it has.
-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "helperPrinters" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "helperPrintersAt" TIMESTAMP(3);

