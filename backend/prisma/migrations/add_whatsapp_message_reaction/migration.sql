-- Reacciones (👍 etc.) del cliente a un mensaje nuestro por WhatsApp: antes
-- caían en un WhatsappMessage con content null (indistinguible de un mensaje
-- vacío en la UI). Ahora quedan marcadas con reactionEmoji + opcionalmente
-- el mensaje al que reaccionaron (reactionToId, self-relation).

-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN "reactionEmoji" TEXT;
ALTER TABLE "WhatsappMessage" ADD COLUMN "reactionToId" INTEGER;

-- CreateIndex
CREATE INDEX "WhatsappMessage_reactionToId_idx" ON "WhatsappMessage"("reactionToId");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_reactionToId_fkey" FOREIGN KEY ("reactionToId") REFERENCES "WhatsappMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
