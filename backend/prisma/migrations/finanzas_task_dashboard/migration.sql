-- AlterTable
ALTER TABLE "FinanceTask" ADD COLUMN     "responsibleId" INTEGER,
ADD COLUMN     "taskId" INTEGER;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "financeTaskProjectId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTask_taskId_key" ON "FinanceTask"("taskId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_financeTaskProjectId_fkey" FOREIGN KEY ("financeTaskProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
