-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'UNBLOCKED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "leadId" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
