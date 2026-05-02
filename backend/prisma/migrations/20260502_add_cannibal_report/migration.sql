-- CreateTable: CannibalReport
CREATE TABLE "CannibalReport" (
  "id"                SERIAL PRIMARY KEY,
  "projectId"         INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"       INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "dateRange"         TEXT NOT NULL DEFAULT '90d',
  "totalConflicts"    INTEGER,
  "criticalCount"     INTEGER,
  "warningCount"      INTEGER,
  "lowCount"          INTEGER,
  "trafficAtRisk"     INTEGER,
  "conflicts"         TEXT NOT NULL DEFAULT '[]',
  "resumenGeneral"    TEXT,
  "errorMsg"          TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CannibalReport_workspaceId_idx" ON "CannibalReport"("workspaceId");
CREATE INDEX "CannibalReport_projectId_workspaceId_idx" ON "CannibalReport"("projectId", "workspaceId");
