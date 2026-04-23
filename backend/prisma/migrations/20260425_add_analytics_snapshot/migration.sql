-- Snapshots mensuales de Google Analytics por proyecto
CREATE TABLE "AnalyticsSnapshot" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL,
  "projectId"   INTEGER NOT NULL,
  "month"       TEXT    NOT NULL,
  "sessions"    INTEGER NOT NULL DEFAULT 0,
  "activeUsers" INTEGER NOT NULL DEFAULT 0,
  "newUsers"    INTEGER NOT NULL DEFAULT 0,
  "pageviews"   INTEGER NOT NULL DEFAULT 0,
  "bounceRate"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "topChannels" TEXT    NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsSnapshot_projectId_month_key" UNIQUE ("projectId", "month"),
  CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AnalyticsSnapshot_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE  ON UPDATE CASCADE
);
CREATE INDEX "AnalyticsSnapshot_workspaceId_idx" ON "AnalyticsSnapshot"("workspaceId");
CREATE INDEX "AnalyticsSnapshot_projectId_idx"   ON "AnalyticsSnapshot"("projectId");

-- Insights IA mensuales por proyecto
CREATE TABLE "AnalyticsInsight" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL,
  "projectId"   INTEGER NOT NULL,
  "month"       TEXT    NOT NULL,
  "content"     TEXT    NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsInsight_projectId_month_key" UNIQUE ("projectId", "month"),
  CONSTRAINT "AnalyticsInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AnalyticsInsight_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE  ON UPDATE CASCADE
);
CREATE INDEX "AnalyticsInsight_workspaceId_idx" ON "AnalyticsInsight"("workspaceId");
CREATE INDEX "AnalyticsInsight_projectId_idx"   ON "AnalyticsInsight"("projectId");
