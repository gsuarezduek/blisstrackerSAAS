-- Link público de solo lectura por carpeta de Archivos (ProjectFile) — nullable,
-- ninguna carpeta existente queda compartida. Se genera bajo demanda en código
-- (crypto.randomUUID(), createPublicLink) al momento de "Compartir", no acá.

-- AddColumn
ALTER TABLE "ProjectFile" ADD COLUMN "publicToken" TEXT;

-- CreateIndex (Postgres permite múltiples NULL en un índice único)
CREATE UNIQUE INDEX "ProjectFile_publicToken_key" ON "ProjectFile"("publicToken");
