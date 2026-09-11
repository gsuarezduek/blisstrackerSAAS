-- Vincula piezas de Contenido con archivos ya existentes en el repositorio de
-- Archivos del proyecto (ProjectFile) — referencia, no copia: no duplica bytes
-- ni objeto R2. Ver concepto "Vincular archivos de Archivos ↔ piezas de Contenido".

-- CreateTable
CREATE TABLE "ContentPieceFile" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "linkedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPieceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPieceFile_pieceId_fileId_key" ON "ContentPieceFile"("pieceId", "fileId");
CREATE INDEX "ContentPieceFile_pieceId_idx" ON "ContentPieceFile"("pieceId");
CREATE INDEX "ContentPieceFile_fileId_idx" ON "ContentPieceFile"("fileId");
CREATE INDEX "ContentPieceFile_workspaceId_idx" ON "ContentPieceFile"("workspaceId");

-- AddForeignKey
ALTER TABLE "ContentPieceFile" ADD CONSTRAINT "ContentPieceFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPieceFile" ADD CONSTRAINT "ContentPieceFile_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPieceFile" ADD CONSTRAINT "ContentPieceFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPieceFile" ADD CONSTRAINT "ContentPieceFile_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
