-- Papelera de Archivos: "eliminar" pasa a ser soft-delete (deletedAt/deletedById),
-- recuperable desde la papelera. Mismo patrón que ContentPiece (add_content_module).

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProjectFile" ADD COLUMN "deletedById" INTEGER;

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_deletedAt_idx" ON "ProjectFile"("projectId", "deletedAt");

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
