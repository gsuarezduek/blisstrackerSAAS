-- SearchConsoleSnapshot: snapshot mensual de datos de Google Search Console por proyecto
CREATE TABLE "SearchConsoleSnapshot" (
  "id"          SERIAL PRIMARY KEY,
  "projectId"   INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"       TEXT NOT NULL,
  "clicks"      INTEGER NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "ctr"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "devices"     TEXT NOT NULL DEFAULT '{}',   -- JSON: {DESKTOP:{clicks,impressions}, MOBILE:{...}}
  "countries"   TEXT NOT NULL DEFAULT '[]',   -- JSON: [{country, clicks, impressions}]
  "topQueries"  TEXT NOT NULL DEFAULT '[]',   -- JSON: [{query, clicks, impressions, ctr, position}]
  "topPages"    TEXT NOT NULL DEFAULT '[]',   -- JSON: [{page, clicks, impressions, ctr, position}]
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchConsoleSnapshot_projectId_month_key" UNIQUE ("projectId", "month")
);
CREATE INDEX "SearchConsoleSnapshot_workspaceId_idx" ON "SearchConsoleSnapshot"("workspaceId");
CREATE INDEX "SearchConsoleSnapshot_projectId_idx"   ON "SearchConsoleSnapshot"("projectId");

-- SeoAiInsight: análisis IA basado en datos live de GSC (uno por proyecto, se sobreescribe)
CREATE TABLE "SeoAiInsight" (
  "id"          SERIAL PRIMARY KEY,
  "projectId"   INTEGER NOT NULL UNIQUE REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "content"     TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SeoAiInsight_workspaceId_idx" ON "SeoAiInsight"("workspaceId");
