-- Último resultado del Ads Advisor (diagnóstico + copys IA) por proyecto+plataforma.
-- Cachea el output de generateAdsAdvisor() para que el panel "Hoy" pueda leerlo sin
-- volver a pegarle a Claude; se pisa (upsert) en cada nuevo análisis.
CREATE TABLE "AdsAdvisorResult" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL,
  "projectId"   INTEGER NOT NULL,
  "platform"    TEXT NOT NULL,          -- "meta_ads" | "google_ads"

  "diagnostico" TEXT NOT NULL,          -- JSON: [{ambito,referencia,tipo,prioridad,titulo,detalle}]
  "nuevosCopys" TEXT NOT NULL,          -- JSON: [{angulo,headline,texto,motivo}]
  "generatedAt" TIMESTAMP(3) NOT NULL
);

-- AddForeignKey
ALTER TABLE "AdsAdvisorResult"
  ADD CONSTRAINT "AdsAdvisorResult_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdsAdvisorResult"
  ADD CONSTRAINT "AdsAdvisorResult_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique: un resultado por proyecto + plataforma
CREATE UNIQUE INDEX "AdsAdvisorResult_projectId_platform_key"
  ON "AdsAdvisorResult"("projectId", "platform");

-- Índice de acceso frecuente
CREATE INDEX "AdsAdvisorResult_workspaceId_idx" ON "AdsAdvisorResult"("workspaceId");
