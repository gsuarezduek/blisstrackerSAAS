-- AlterTable
ALTER TABLE "FinanceInvoice" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'invoice',
ADD COLUMN     "relatedInvoiceId" INTEGER;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
