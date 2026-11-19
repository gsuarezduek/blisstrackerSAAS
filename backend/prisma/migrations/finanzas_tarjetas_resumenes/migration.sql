-- CreateTable
CREATE TABLE "FinanceCard" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "last4" TEXT,
    "arsAccountId" INTEGER,
    "usdAccountId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCardStatement" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "closingDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "fileEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "fileExpiresAt" TIMESTAMP(3),
    "summary" JSONB,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "FinanceCardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCardStatementLine" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "statementId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "movementId" INTEGER,

    CONSTRAINT "FinanceCardStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCardRule" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCardRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceCard_workspaceId_idx" ON "FinanceCard"("workspaceId");

-- CreateIndex
CREATE INDEX "FinanceCardStatement_workspaceId_cardId_idx" ON "FinanceCardStatement"("workspaceId", "cardId");

-- CreateIndex
CREATE INDEX "FinanceCardStatement_fileExpiresAt_idx" ON "FinanceCardStatement"("fileExpiresAt");

-- CreateIndex
CREATE INDEX "FinanceCardStatementLine_cardId_fingerprint_idx" ON "FinanceCardStatementLine"("cardId", "fingerprint");

-- CreateIndex
CREATE INDEX "FinanceCardStatementLine_statementId_idx" ON "FinanceCardStatementLine"("statementId");

-- CreateIndex
CREATE INDEX "FinanceCardStatementLine_movementId_idx" ON "FinanceCardStatementLine"("movementId");

-- CreateIndex
CREATE INDEX "FinanceCardRule_workspaceId_merchantKey_idx" ON "FinanceCardRule"("workspaceId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCardRule_cardId_merchantKey_type_key" ON "FinanceCardRule"("cardId", "merchantKey", "type");

-- AddForeignKey
ALTER TABLE "FinanceCard" ADD CONSTRAINT "FinanceCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCard" ADD CONSTRAINT "FinanceCard_arsAccountId_fkey" FOREIGN KEY ("arsAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCard" ADD CONSTRAINT "FinanceCard_usdAccountId_fkey" FOREIGN KEY ("usdAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatement" ADD CONSTRAINT "FinanceCardStatement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatement" ADD CONSTRAINT "FinanceCardStatement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FinanceCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatementLine" ADD CONSTRAINT "FinanceCardStatementLine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatementLine" ADD CONSTRAINT "FinanceCardStatementLine_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FinanceCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatementLine" ADD CONSTRAINT "FinanceCardStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FinanceCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardStatementLine" ADD CONSTRAINT "FinanceCardStatementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "FinanceMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardRule" ADD CONSTRAINT "FinanceCardRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardRule" ADD CONSTRAINT "FinanceCardRule_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FinanceCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardRule" ADD CONSTRAINT "FinanceCardRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCardRule" ADD CONSTRAINT "FinanceCardRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

