-- DropForeignKey
ALTER TABLE "FinanceMovement" DROP CONSTRAINT "FinanceMovement_itemId_fkey";

-- AlterTable
ALTER TABLE "FinanceMovement" ALTER COLUMN "itemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

