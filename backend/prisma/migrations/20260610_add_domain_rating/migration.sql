-- AlterTable: Domain Rating (Ahrefs) cacheado en Project
ALTER TABLE "Project" ADD COLUMN "domainRating" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "domainRatingAt" TIMESTAMP(3);

-- AlterTable: Domain Rating histórico por snapshot mensual
ALTER TABLE "SearchConsoleSnapshot" ADD COLUMN "domainRating" DOUBLE PRECISION;
