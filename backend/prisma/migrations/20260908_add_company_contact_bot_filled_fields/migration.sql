-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "botFilledFields" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "botFilledFields" JSONB NOT NULL DEFAULT '[]';
