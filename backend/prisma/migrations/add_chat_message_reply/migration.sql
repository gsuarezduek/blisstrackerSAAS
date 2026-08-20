-- Responder un mensaje (estilo WhatsApp/Discord): auto-relación sobre ChatMessage.
-- ON DELETE SET NULL: si se borra el mensaje original, la respuesta queda huérfana
-- (el quote desaparece) en vez de arrastrar en cascada la respuesta.
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" INTEGER;

CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
