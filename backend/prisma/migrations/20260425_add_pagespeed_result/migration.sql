-- Resultados de análisis PageSpeed Insights por proyecto
CREATE TABLE "PageSpeedResult" (
  "id"               SERIAL PRIMARY KEY,
  "workspaceId"      INTEGER NOT NULL,
  "projectId"        INTEGER NOT NULL,
  "url"              TEXT    NOT NULL,
  "strategy"         TEXT    NOT NULL DEFAULT 'mobile',
  "status"           TEXT    NOT NULL DEFAULT 'running',
  "performanceScore" INTEGER,
  "metrics"          TEXT    NOT NULL DEFAULT '{}',
  "opportunities"    TEXT    NOT NULL DEFAULT '[]',
  "diagnostics"      TEXT    NOT NULL DEFAULT '[]',
  "errorMsg"         TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageSpeedResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PageSpeedResult_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")  ON DELETE CASCADE  ON UPDATE CASCADE
);
CREATE INDEX "PageSpeedResult_workspaceId_idx"            ON "PageSpeedResult"("workspaceId");
CREATE INDEX "PageSpeedResult_projectId_idx"              ON "PageSpeedResult"("projectId");
CREATE INDEX "PageSpeedResult_projectId_strategy_date_idx" ON "PageSpeedResult"("projectId", "strategy", "createdAt" DESC);
