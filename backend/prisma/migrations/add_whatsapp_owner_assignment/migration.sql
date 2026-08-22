-- Responsable reasignable de una conversación de WhatsApp puntual (Fase 2 del
-- plan de WhatsApp) — default implícito (lead.ownerId) resuelto en el
-- controller/frontend, no persistido hasta que alguien reasigna.

-- AlterTable
ALTER TABLE "WhatsappConversation" ADD COLUMN     "assignedToId" INTEGER;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
