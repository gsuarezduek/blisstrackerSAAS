-- Scorecard EOS: métricas clave del negocio con seguimiento semanal o mensual

CREATE TABLE "ScorecardMetric" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "ownerId"     INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "goal"        DOUBLE PRECISION,
  "unit"        TEXT,
  "frequency"   TEXT NOT NULL DEFAULT 'weekly',  -- 'weekly' | 'monthly'
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ScorecardMetric_workspaceId_idx" ON "ScorecardMetric"("workspaceId");

CREATE TABLE "ScorecardEntry" (
  "id"          SERIAL PRIMARY KEY,
  "metricId"    INTEGER NOT NULL REFERENCES "ScorecardMetric"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "period"      TEXT NOT NULL,  -- 'YYYY-Www' para semanal (ISO), 'YYYY-MM' para mensual
  "value"       DOUBLE PRECISION,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScorecardEntry_metricId_period_key" UNIQUE ("metricId", "period")
);
CREATE INDEX "ScorecardEntry_metricId_idx"    ON "ScorecardEntry"("metricId");
CREATE INDEX "ScorecardEntry_workspaceId_idx" ON "ScorecardEntry"("workspaceId");
