-- AlterTable: agregar quién generó (o regeneró) el informe por última vez
ALTER TABLE "MonthlyReport"
  ADD COLUMN "generatedById" INTEGER;

ALTER TABLE "MonthlyReport"
  ADD CONSTRAINT "MonthlyReport_generatedById_fkey"
  FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MonthlyReport_generatedById_idx" ON "MonthlyReport"("generatedById");
