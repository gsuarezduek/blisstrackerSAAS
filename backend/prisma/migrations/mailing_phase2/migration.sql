-- AlterTable
ALTER TABLE "MailingContact" ADD COLUMN     "confirmSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MailingList" ADD COLUMN     "crmFilter" JSONB,
ADD COLUMN     "crmSyncedAt" TIMESTAMP(3),
ADD COLUMN     "formSuccessUrl" TEXT;

