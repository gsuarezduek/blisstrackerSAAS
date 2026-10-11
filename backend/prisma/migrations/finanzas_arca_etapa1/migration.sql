-- AlterTable
ALTER TABLE "FinanceItem" ADD COLUMN     "defaultIssuerId" INTEGER,
ADD COLUMN     "ivaCondition" TEXT;

-- CreateTable
CREATE TABLE "FinanceIssuer" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "taxCondition" TEXT NOT NULL,
    "salesPoint" INTEGER NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "certificate" TEXT,
    "privateKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceIssuer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_store" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arca_store_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "FinanceIssuer_workspaceId_idx" ON "FinanceIssuer"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceIssuer_workspaceId_active_idx" ON "FinanceIssuer"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "FinanceItem_defaultIssuerId_idx" ON "FinanceItem"("defaultIssuerId");

-- AddForeignKey
ALTER TABLE "FinanceIssuer" ADD CONSTRAINT "FinanceIssuer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceIssuer" ADD CONSTRAINT "FinanceIssuer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_defaultIssuerId_fkey" FOREIGN KEY ("defaultIssuerId") REFERENCES "FinanceIssuer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
