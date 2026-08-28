-- Entrenamiento del bot de WhatsApp: reglas de seguridad (palabras prohibidas
-- en la respuesta + palabras del cliente que disparan traspaso a un humano) y
-- base de conocimiento (documentos de contexto, texto extraído inyectado en el
-- system prompt). Ver whatsappBot.service.js `generateBotReply`/`knowledgeBlock`.

-- AlterTable
ALTER TABLE "WhatsappBotConfig"
  ADD COLUMN "blockedWords" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "escalationWords" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "handoffMessage" TEXT;

-- CreateTable
CREATE TABLE "WhatsappBotDocument" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT,
    "fileData" BYTEA,
    "extractedText" TEXT,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorMsg" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappBotDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappBotDocument_workspaceId_idx" ON "WhatsappBotDocument"("workspaceId");

-- AddForeignKey
ALTER TABLE "WhatsappBotDocument" ADD CONSTRAINT "WhatsappBotDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappBotDocument" ADD CONSTRAINT "WhatsappBotDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
