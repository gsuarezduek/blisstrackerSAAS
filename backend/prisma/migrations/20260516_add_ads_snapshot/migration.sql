-- CreateTable
CREATE TABLE "AdsSnapshot" (
  "id"             SERIAL PRIMARY KEY,
  "workspaceId"    INTEGER NOT NULL,
  "projectId"      INTEGER NOT NULL,
  "month"          TEXT NOT NULL,          -- "YYYY-MM"
  "type"           TEXT NOT NULL,          -- "meta_ads" | "google_ads"

  -- Métricas comunes
  "spend"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions"    INTEGER NOT NULL DEFAULT 0,
  "clicks"         INTEGER NOT NULL DEFAULT 0,
  "ctr"            DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Meta Ads específico
  "reach"          INTEGER,
  "cpm"            DOUBLE PRECISION,
  "cpc"            DOUBLE PRECISION,

  -- Google Ads específico
  "conversions"    DOUBLE PRECISION,
  "avgCpc"         DOUBLE PRECISION,

  -- Top campañas (JSON)
  "topCampaigns"   TEXT NOT NULL DEFAULT '[]',

  -- Metadata
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "campaignsCount" INTEGER NOT NULL DEFAULT 0,

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AddForeignKey
ALTER TABLE "AdsSnapshot"
  ADD CONSTRAINT "AdsSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdsSnapshot"
  ADD CONSTRAINT "AdsSnapshot_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique: un snapshot por proyecto + mes + tipo
CREATE UNIQUE INDEX "AdsSnapshot_projectId_month_type_key"
  ON "AdsSnapshot"("projectId", "month", "type");

-- Índices de acceso frecuente
CREATE INDEX "AdsSnapshot_workspaceId_idx" ON "AdsSnapshot"("workspaceId");
CREATE INDEX "AdsSnapshot_projectId_idx"   ON "AdsSnapshot"("projectId");
