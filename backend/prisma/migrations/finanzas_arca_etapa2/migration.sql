-- AlterTable
ALTER TABLE "FinanceInvoice" ADD COLUMN     "arcaIdempotencyKey" TEXT,
ADD COLUMN     "arcaResponseRaw" JSONB,
ADD COLUMN     "arcaStatus" TEXT,
ADD COLUMN     "cae" TEXT,
ADD COLUMN     "caeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "issuerId" INTEGER,
ADD COLUMN     "ivaRate" DECIMAL(6,3),
ADD COLUMN     "voucherType" TEXT,
ALTER COLUMN "number" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInvoice_arcaIdempotencyKey_key" ON "FinanceInvoice"("arcaIdempotencyKey");

-- CreateIndex
CREATE INDEX "FinanceInvoice_issuerId_idx" ON "FinanceInvoice"("issuerId");

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "FinanceIssuer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
