-- AlterTable: agregar banner por informe mensual
ALTER TABLE "MonthlyReport" ADD COLUMN "bannerData" BYTEA;
ALTER TABLE "MonthlyReport" ADD COLUMN "bannerMimeType" TEXT;
