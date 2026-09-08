-- Papelera de Contenido: borrar una pieza pasa a ser soft-delete (deletedAt),
-- recuperable durante contentPieceTrashRetentionDays (default 30) antes de que
-- la limpieza semanal la borre en duro.
ALTER TABLE "ContentPiece" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ContentPiece" ADD COLUMN "deletedById" INTEGER;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ContentPiece_projectId_deletedAt_idx" ON "ContentPiece"("projectId", "deletedAt");
