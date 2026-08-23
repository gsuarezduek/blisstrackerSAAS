-- Bot de WhatsApp (Fase 4 del plan): config por workspace (interruptor
-- maestro + prompt) + handoff bot/humano por conversación. v1 sin horario ni
-- condiciones de activación automáticas — solo on/off + takeover manual.

-- AlterTable
ALTER TABLE "WhatsappConversation" ADD COLUMN     "botEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "WhatsappBotConfig" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappBotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappBotConfig_workspaceId_key" ON "WhatsappBotConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "WhatsappBotConfig" ADD CONSTRAINT "WhatsappBotConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
