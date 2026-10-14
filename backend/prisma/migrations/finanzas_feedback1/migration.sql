-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "financeIvaMode" TEXT NOT NULL DEFAULT 'add';

-- AlterTable
ALTER TABLE "FinanceExtra" ADD COLUMN     "providerAmount" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FinanceTask" ADD COLUMN     "itemId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceTask_itemId_idx" ON "FinanceTask"("itemId");

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
