-- Multimedia en WhatsApp (Fase 3 del plan): reemplaza el WhatsappMessage.mediaUrl
-- nunca usado por una tabla propia WhatsappMedia (dual storage R2/DB, mismo
-- patrón que SocialImage/ContentAsset), servida por URL pública no-adivinable.

-- AlterTable
ALTER TABLE "WhatsappMessage" DROP COLUMN "mediaUrl";

-- CreateTable
CREATE TABLE "WhatsappMedia" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "objectKey" TEXT,
    "mediaData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMedia_messageId_key" ON "WhatsappMedia"("messageId");

-- CreateIndex
CREATE INDEX "WhatsappMedia_workspaceId_idx" ON "WhatsappMedia"("workspaceId");

-- AddForeignKey
ALTER TABLE "WhatsappMedia" ADD CONSTRAINT "WhatsappMedia_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMedia" ADD CONSTRAINT "WhatsappMedia_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsappMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
