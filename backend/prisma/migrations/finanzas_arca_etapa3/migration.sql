-- AlterTable
ALTER TABLE "FinanceIssuer" ADD COLUMN     "activitiesStartDate" TIMESTAMP(3),
ADD COLUMN     "address" TEXT,
ADD COLUMN     "grossIncome" TEXT,
ADD COLUMN     "tradeName" TEXT;

-- AlterTable
ALTER TABLE "FinanceItem" ADD COLUMN     "address" TEXT;
