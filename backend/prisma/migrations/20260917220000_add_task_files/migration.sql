-- Adjuntos de Tareas: vincula una Task con un ProjectFile del repositorio de
-- Archivos del proyecto. El archivo se sube directo ahí (mismo presign/confirm
-- de Archivos, carpeta resuelta automáticamente) — no es una asociación a algo
-- ya existente como ContentPieceFile, sino el punto de entrada de la subida.
-- Ver tasks/attachments.controller.js.

-- CreateTable
CREATE TABLE "TaskFile" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "linkedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskFile_taskId_fileId_key" ON "TaskFile"("taskId", "fileId");

-- CreateIndex
CREATE INDEX "TaskFile_taskId_idx" ON "TaskFile"("taskId");

-- CreateIndex
CREATE INDEX "TaskFile_fileId_idx" ON "TaskFile"("fileId");

-- CreateIndex
CREATE INDEX "TaskFile_workspaceId_idx" ON "TaskFile"("workspaceId");

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
