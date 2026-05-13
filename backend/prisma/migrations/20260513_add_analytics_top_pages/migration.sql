-- Add topPages and topSources to AnalyticsSnapshot
ALTER TABLE "AnalyticsSnapshot" ADD COLUMN "topPages"   TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "AnalyticsSnapshot" ADD COLUMN "topSources" TEXT NOT NULL DEFAULT '[]';
