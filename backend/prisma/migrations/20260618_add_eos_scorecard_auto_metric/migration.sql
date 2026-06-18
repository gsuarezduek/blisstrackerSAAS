-- Métrica automática del Scorecard EOS: valores calculados por el sistema (tardanzas, ocupación),
-- no se cargan a mano. autoKey identifica el tipo; el índice único garantiza a lo sumo una por
-- tipo y workspace (en Postgres los NULL son distintos, así que las métricas manuales no chocan).
ALTER TABLE "ScorecardMetric" ADD COLUMN "autoKey" TEXT;
CREATE UNIQUE INDEX "ScorecardMetric_workspaceId_autoKey_key" ON "ScorecardMetric"("workspaceId", "autoKey");
