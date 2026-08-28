-- Entrenamiento del bot de WhatsApp (Fase 4): ejemplos few-shot curados por el
-- admin, resumen con IA de documentos largos (en vez de truncado a lo bruto), y
-- log de escalamientos para el panel de calidad. Ver whatsappBot.service.js.

-- AlterTable
ALTER TABLE "WhatsappBotConfig" ADD COLUMN "examples" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "WhatsappBotDocument" ADD COLUMN "summarized" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WhatsappBotEscalation" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT,
    "clientMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappBotEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappBotEscalation_workspaceId_createdAt_idx" ON "WhatsappBotEscalation"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappBotEscalation" ADD CONSTRAINT "WhatsappBotEscalation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappBotEscalation" ADD CONSTRAINT "WhatsappBotEscalation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
