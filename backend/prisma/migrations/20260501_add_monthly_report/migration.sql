-- CreateTable: MonthlyReport
-- Informe mensual por proyecto — token UUID para URL pública compartible

CREATE TABLE "MonthlyReport" (
  "id"          SERIAL PRIMARY KEY,
  "projectId"   INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"       TEXT NOT NULL,
  "token"       TEXT NOT NULL UNIQUE,
  "objectives"  TEXT NOT NULL DEFAULT '{}',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyReport_projectId_month_key" UNIQUE ("projectId", "month")
);

CREATE INDEX "MonthlyReport_workspaceId_idx" ON "MonthlyReport"("workspaceId");
