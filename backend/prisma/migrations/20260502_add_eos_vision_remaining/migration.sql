-- Estrategia de Marketing
ALTER TABLE "EOSData" ADD COLUMN "marketingTarget"    TEXT;
ALTER TABLE "EOSData" ADD COLUMN "marketingUniques"   TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "EOSData" ADD COLUMN "marketingProcess"   TEXT;
ALTER TABLE "EOSData" ADD COLUMN "marketingGuarantee" TEXT;

-- Imagen a 3 años
ALTER TABLE "EOSData" ADD COLUMN "threeYearRevenue"     TEXT;
ALTER TABLE "EOSData" ADD COLUMN "threeYearProfit"      TEXT;
ALTER TABLE "EOSData" ADD COLUMN "threeYearHeadcount"   TEXT;
ALTER TABLE "EOSData" ADD COLUMN "threeYearDescription" TEXT;
ALTER TABLE "EOSData" ADD COLUMN "threeYearGoals"       TEXT NOT NULL DEFAULT '[]';

-- Plan a 1 año
ALTER TABLE "EOSData" ADD COLUMN "oneYearRevenue" TEXT;
ALTER TABLE "EOSData" ADD COLUMN "oneYearProfit"  TEXT;
ALTER TABLE "EOSData" ADD COLUMN "oneYearGoals"   TEXT NOT NULL DEFAULT '[]';
