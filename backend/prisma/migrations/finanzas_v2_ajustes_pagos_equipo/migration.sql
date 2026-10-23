-- Finanzas: razón social del cliente, factura asociada en cheques (banco emisor
-- pasa a opcional/legacy), ajustes de saldo por cuenta y pagos al equipo de un Extra.

-- AlterTable
ALTER TABLE "FinanceItem" ADD COLUMN "legalName" TEXT;

-- AlterTable
ALTER TABLE "FinanceCheck" ALTER COLUMN "issuingBank" DROP NOT NULL;
ALTER TABLE "FinanceCheck" ADD COLUMN "invoiceNumber" TEXT;

-- CreateTable
CREATE TABLE "FinanceBalanceAdjustment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExtraTeamPayout" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "extraId" INTEGER NOT NULL,
    "userId" INTEGER,
    "movementId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExtraTeamPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceBalanceAdjustment_workspaceId_idx" ON "FinanceBalanceAdjustment"("workspaceId");
CREATE INDEX "FinanceBalanceAdjustment_accountId_date_idx" ON "FinanceBalanceAdjustment"("accountId", "date");
CREATE UNIQUE INDEX "FinanceExtraTeamPayout_movementId_key" ON "FinanceExtraTeamPayout"("movementId");
CREATE INDEX "FinanceExtraTeamPayout_workspaceId_idx" ON "FinanceExtraTeamPayout"("workspaceId");
CREATE INDEX "FinanceExtraTeamPayout_extraId_idx" ON "FinanceExtraTeamPayout"("extraId");

-- AddForeignKey
ALTER TABLE "FinanceBalanceAdjustment" ADD CONSTRAINT "FinanceBalanceAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceBalanceAdjustment" ADD CONSTRAINT "FinanceBalanceAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBalanceAdjustment" ADD CONSTRAINT "FinanceBalanceAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceBalanceAdjustment" ADD CONSTRAINT "FinanceBalanceAdjustment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceExtraTeamPayout" ADD CONSTRAINT "FinanceExtraTeamPayout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceExtraTeamPayout" ADD CONSTRAINT "FinanceExtraTeamPayout_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "FinanceExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceExtraTeamPayout" ADD CONSTRAINT "FinanceExtraTeamPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceExtraTeamPayout" ADD CONSTRAINT "FinanceExtraTeamPayout_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "FinanceMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
