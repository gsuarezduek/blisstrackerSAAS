-- AlterTable
ALTER TABLE "WhatsappAccount" ADD COLUMN     "wabaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappAccount_wabaId_key" ON "WhatsappAccount"("wabaId");
