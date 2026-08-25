-- Toggle por workspace: corre el Ads Advisor automáticamente cada lunes (opt-out)
ALTER TABLE "Workspace" ADD COLUMN "adsAdvisorAutoEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Recomendaciones descartadas del panel "Hoy"
CREATE TABLE "DismissedFinding" (
  "id"            SERIAL PRIMARY KEY,
  "workspaceId"   INTEGER NOT NULL,
  "projectId"     INTEGER NOT NULL,
  "source"        TEXT NOT NULL,
  "signature"     TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "dismissedById" INTEGER,
  "dismissedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AddForeignKey
ALTER TABLE "DismissedFinding"
  ADD CONSTRAINT "DismissedFinding_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DismissedFinding"
  ADD CONSTRAINT "DismissedFinding_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DismissedFinding"
  ADD CONSTRAINT "DismissedFinding_dismissedById_fkey"
  FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique: no duplicar el mismo hallazgo dos veces por proyecto
CREATE UNIQUE INDEX "DismissedFinding_projectId_source_signature_key"
  ON "DismissedFinding"("projectId", "source", "signature");

-- Índice de acceso frecuente
CREATE INDEX "DismissedFinding_workspaceId_idx" ON "DismissedFinding"("workspaceId");
