-- Tab "Archivos" en la ficha del proyecto: repositorio de archivos tipo Drive
-- (carpetas + archivos), sobre Cloudflare R2 (objectStorage.service.js), como
-- alternativa a pagar Google Workspace solo por almacenamiento compartido.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "filesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "mimeType" TEXT,
    "objectKey" TEXT,
    "posterKey" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_parentId_idx" ON "ProjectFile"("projectId", "parentId");

-- CreateIndex
CREATE INDEX "ProjectFile_workspaceId_idx" ON "ProjectFile"("workspaceId");

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (auto-relación: borrar una carpeta cascadea sus hijos)
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
