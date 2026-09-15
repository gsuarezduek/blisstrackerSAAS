-- Adjuntos del chat interno (foto/documento por mensaje, como gifUrl pero
-- subido por el usuario). Dual storage R2/DB, mismo patrón que WhatsappMedia.
-- Se borra solo (R2 + fila) a los `chatAttachmentRetentionDays` vía la
-- limpieza semanal (cleanup.service.js); el mensaje en sí sobrevive.

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "objectKey" TEXT,
    "fileData" BYTEA,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE INDEX "ChatAttachment_workspaceId_idx" ON "ChatAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatAttachment_createdAt_idx" ON "ChatAttachment"("createdAt");

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
