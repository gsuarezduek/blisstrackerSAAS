-- AlterTable
ALTER TABLE "MailingConfig" ADD COLUMN     "warmupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warmupStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MailingCampaign" ADD COLUMN     "abDecidedAt" TIMESTAMP(3),
ADD COLUMN     "abTestPercent" INTEGER,
ADD COLUMN     "abWaitHours" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "abWinner" TEXT,
ADD COLUMN     "resendOfId" INTEGER,
ADD COLUMN     "subjectB" TEXT;

-- AlterTable
ALTER TABLE "MailingSend" ADD COLUMN     "variant" TEXT;

-- AddForeignKey
ALTER TABLE "MailingCampaign" ADD CONSTRAINT "MailingCampaign_resendOfId_fkey" FOREIGN KEY ("resendOfId") REFERENCES "MailingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

