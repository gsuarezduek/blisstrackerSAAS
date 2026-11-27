-- Finanzas: cada cuenta puede pertenecer (opcional) a una entidad de facturación (FinanceIssuer)
ALTER TABLE "FinanceAccount" ADD COLUMN "issuerId" INTEGER;
CREATE INDEX "FinanceAccount_issuerId_idx" ON "FinanceAccount"("issuerId");
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "FinanceIssuer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
