-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "financeAttachmentsMaxMbOverride" INTEGER;

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "initialBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "hasInvestments" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTax" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(6,3) NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "baseType" TEXT NOT NULL,
    "baseTaxId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountTax" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "taxId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceItem" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "tracksAccount" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "contractedService" TEXT,
    "notes" TEXT,
    "projectId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceMovement" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "itemId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "note" TEXT,
    "sourceMovementId" INTEGER,
    "paymentMethod" TEXT,
    "accountApplication" TEXT,
    "invoiceId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceMovementTax" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "movementId" INTEGER,
    "transferId" INTEGER,
    "taxId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(6,3) NOT NULL,
    "baseType" TEXT NOT NULL,
    "baseTaxLineId" INTEGER,
    "baseAmount" DECIMAL(20,8) NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "generatedMovementId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceMovementTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCheck" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "movementId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issuingBank" TEXT NOT NULL,
    "estimatedCollectionDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "creditedAt" TIMESTAMP(3),
    "creditedAccountId" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransfer" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "fromAccountId" INTEGER NOT NULL,
    "fromAmount" DECIMAL(20,8) NOT NULL,
    "fromIsFund" BOOLEAN NOT NULL DEFAULT false,
    "toAccountId" INTEGER NOT NULL,
    "toAmount" DECIMAL(20,8) NOT NULL,
    "toIsFund" BOOLEAN NOT NULL DEFAULT false,
    "exchangeRate" DECIMAL(20,8),
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFundValuation" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(20,8) NOT NULL,
    "periodResult" DECIMAL(20,8),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceFundValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInvoice" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAttachment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "objectKey" TEXT,
    "sizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExtra" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "itemId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "total" DECIMAL(20,8) NOT NULL,
    "companyAmount" DECIMAL(20,8) NOT NULL,
    "teamAmount" DECIMAL(20,8) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "teamPaid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExtraPayment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "extraId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "percentage" DECIMAL(6,3) NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "movementId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExtraPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceNextAction" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'once',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "previousActionId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceNextAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTask" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "origin" TEXT,
    "originId" INTEGER,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "amount" DECIMAL(20,8),
    "date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "postponedUntil" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceWorkspaceNote" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "content" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceWorkspaceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAiSummary" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuditLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_workspaceId_idx" ON "FinanceAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceAccount_workspaceId_active_idx" ON "FinanceAccount"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "FinanceTax_workspaceId_idx" ON "FinanceTax"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceTax_workspaceId_active_idx" ON "FinanceTax"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "FinanceAccountTax_workspaceId_idx" ON "FinanceAccountTax"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountTax_accountId_taxId_key" ON "FinanceAccountTax"("accountId", "taxId");

-- CreateIndex
CREATE INDEX "FinanceCategory_workspaceId_idx" ON "FinanceCategory"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceCategory_workspaceId_type_active_idx" ON "FinanceCategory"("workspaceId", "type", "active");

-- CreateIndex
CREATE INDEX "FinanceItem_workspaceId_idx" ON "FinanceItem"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceItem_workspaceId_active_idx" ON "FinanceItem"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "FinanceItem_workspaceId_tracksAccount_idx" ON "FinanceItem"("workspaceId", "tracksAccount");

-- CreateIndex
CREATE INDEX "FinanceItem_categoryId_idx" ON "FinanceItem"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceItem_projectId_idx" ON "FinanceItem"("projectId");

-- CreateIndex
CREATE INDEX "FinanceMovement_workspaceId_idx" ON "FinanceMovement"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceMovement_workspaceId_type_date_idx" ON "FinanceMovement"("workspaceId", "type", "date");

-- CreateIndex
CREATE INDEX "FinanceMovement_workspaceId_accountId_idx" ON "FinanceMovement"("workspaceId", "accountId");

-- CreateIndex
CREATE INDEX "FinanceMovement_itemId_idx" ON "FinanceMovement"("itemId");

-- CreateIndex
CREATE INDEX "FinanceMovement_categoryId_idx" ON "FinanceMovement"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceMovement_sourceMovementId_idx" ON "FinanceMovement"("sourceMovementId");

-- CreateIndex
CREATE INDEX "FinanceMovement_invoiceId_idx" ON "FinanceMovement"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMovementTax_generatedMovementId_key" ON "FinanceMovementTax"("generatedMovementId");

-- CreateIndex
CREATE INDEX "FinanceMovementTax_workspaceId_idx" ON "FinanceMovementTax"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceMovementTax_movementId_idx" ON "FinanceMovementTax"("movementId");

-- CreateIndex
CREATE INDEX "FinanceMovementTax_transferId_idx" ON "FinanceMovementTax"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCheck_movementId_key" ON "FinanceCheck"("movementId");

-- CreateIndex
CREATE INDEX "FinanceCheck_workspaceId_idx" ON "FinanceCheck"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceCheck_workspaceId_status_idx" ON "FinanceCheck"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FinanceTransfer_workspaceId_idx" ON "FinanceTransfer"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceTransfer_workspaceId_date_idx" ON "FinanceTransfer"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "FinanceTransfer_fromAccountId_idx" ON "FinanceTransfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "FinanceTransfer_toAccountId_idx" ON "FinanceTransfer"("toAccountId");

-- CreateIndex
CREATE INDEX "FinanceFundValuation_workspaceId_idx" ON "FinanceFundValuation"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceFundValuation_accountId_date_idx" ON "FinanceFundValuation"("accountId", "date");

-- CreateIndex
CREATE INDEX "FinanceInvoice_workspaceId_idx" ON "FinanceInvoice"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_itemId_idx" ON "FinanceInvoice"("itemId");

-- CreateIndex
CREATE INDEX "FinanceInvoice_workspaceId_dueDate_idx" ON "FinanceInvoice"("workspaceId", "dueDate");

-- CreateIndex
CREATE INDEX "FinanceAttachment_workspaceId_idx" ON "FinanceAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceAttachment_invoiceId_idx" ON "FinanceAttachment"("invoiceId");

-- CreateIndex
CREATE INDEX "FinanceExtra_workspaceId_idx" ON "FinanceExtra"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceExtra_itemId_idx" ON "FinanceExtra"("itemId");

-- CreateIndex
CREATE INDEX "FinanceExtra_workspaceId_status_idx" ON "FinanceExtra"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExtraPayment_movementId_key" ON "FinanceExtraPayment"("movementId");

-- CreateIndex
CREATE INDEX "FinanceExtraPayment_workspaceId_idx" ON "FinanceExtraPayment"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceExtraPayment_movementId_idx" ON "FinanceExtraPayment"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExtraPayment_extraId_number_key" ON "FinanceExtraPayment"("extraId", "number");

-- CreateIndex
CREATE INDEX "FinanceNextAction_workspaceId_idx" ON "FinanceNextAction"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceNextAction_itemId_idx" ON "FinanceNextAction"("itemId");

-- CreateIndex
CREATE INDEX "FinanceNextAction_workspaceId_completed_date_idx" ON "FinanceNextAction"("workspaceId", "completed", "date");

-- CreateIndex
CREATE INDEX "FinanceTask_workspaceId_status_idx" ON "FinanceTask"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FinanceTask_workspaceId_kind_idx" ON "FinanceTask"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "FinanceTask_origin_originId_idx" ON "FinanceTask"("origin", "originId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceWorkspaceNote_workspaceId_key" ON "FinanceWorkspaceNote"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAiSummary_workspaceId_key" ON "FinanceAiSummary"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceAuditLog_workspaceId_entityType_entityId_createdAt_idx" ON "FinanceAuditLog"("workspaceId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceAuditLog_workspaceId_createdAt_idx" ON "FinanceAuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTax" ADD CONSTRAINT "FinanceTax_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTax" ADD CONSTRAINT "FinanceTax_baseTaxId_fkey" FOREIGN KEY ("baseTaxId") REFERENCES "FinanceTax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountTax" ADD CONSTRAINT "FinanceAccountTax_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountTax" ADD CONSTRAINT "FinanceAccountTax_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountTax" ADD CONSTRAINT "FinanceAccountTax_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "FinanceTax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceItem" ADD CONSTRAINT "FinanceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_sourceMovementId_fkey" FOREIGN KEY ("sourceMovementId") REFERENCES "FinanceMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovement" ADD CONSTRAINT "FinanceMovement_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "FinanceMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "FinanceTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "FinanceTax"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_baseTaxLineId_fkey" FOREIGN KEY ("baseTaxLineId") REFERENCES "FinanceMovementTax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMovementTax" ADD CONSTRAINT "FinanceMovementTax_generatedMovementId_fkey" FOREIGN KEY ("generatedMovementId") REFERENCES "FinanceMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCheck" ADD CONSTRAINT "FinanceCheck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCheck" ADD CONSTRAINT "FinanceCheck_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "FinanceMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCheck" ADD CONSTRAINT "FinanceCheck_creditedAccountId_fkey" FOREIGN KEY ("creditedAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCheck" ADD CONSTRAINT "FinanceCheck_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFundValuation" ADD CONSTRAINT "FinanceFundValuation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFundValuation" ADD CONSTRAINT "FinanceFundValuation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFundValuation" ADD CONSTRAINT "FinanceFundValuation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceFundValuation" ADD CONSTRAINT "FinanceFundValuation_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAttachment" ADD CONSTRAINT "FinanceAttachment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtra" ADD CONSTRAINT "FinanceExtra_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtra" ADD CONSTRAINT "FinanceExtra_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtra" ADD CONSTRAINT "FinanceExtra_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtra" ADD CONSTRAINT "FinanceExtra_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtraPayment" ADD CONSTRAINT "FinanceExtraPayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtraPayment" ADD CONSTRAINT "FinanceExtraPayment_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "FinanceExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExtraPayment" ADD CONSTRAINT "FinanceExtraPayment_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "FinanceMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceNextAction" ADD CONSTRAINT "FinanceNextAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceNextAction" ADD CONSTRAINT "FinanceNextAction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceNextAction" ADD CONSTRAINT "FinanceNextAction_previousActionId_fkey" FOREIGN KEY ("previousActionId") REFERENCES "FinanceNextAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceNextAction" ADD CONSTRAINT "FinanceNextAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceNextAction" ADD CONSTRAINT "FinanceNextAction_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTask" ADD CONSTRAINT "FinanceTask_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWorkspaceNote" ADD CONSTRAINT "FinanceWorkspaceNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceWorkspaceNote" ADD CONSTRAINT "FinanceWorkspaceNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAiSummary" ADD CONSTRAINT "FinanceAiSummary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuditLog" ADD CONSTRAINT "FinanceAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuditLog" ADD CONSTRAINT "FinanceAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice único parcial: evita duplicar la misma tarea GENERADA por reglas para
-- el mismo origen (ej. dos tareas "Cheque por vencer" para el mismo cheque).
-- No restringe tareas manuales (kind='manual', sin origin/originId). Prisma no
-- expresa índices únicos parciales en el schema — se agrega a mano acá.
-- CreateIndex
CREATE UNIQUE INDEX "FinanceTask_generated_origin_key" ON "FinanceTask"("workspaceId", "origin", "originId") WHERE "kind" = 'generated';

