-- Insights de Instagram (instagram_business_manage_insights) por mes
-- AlterTable
ALTER TABLE "InstagramSnapshot" ADD COLUMN "reach" INTEGER;
ALTER TABLE "InstagramSnapshot" ADD COLUMN "views" INTEGER;
ALTER TABLE "InstagramSnapshot" ADD COLUMN "totalSaved" INTEGER;
ALTER TABLE "InstagramSnapshot" ADD COLUMN "totalShares" INTEGER;
ALTER TABLE "InstagramSnapshot" ADD COLUMN "avgReach" DOUBLE PRECISION;
