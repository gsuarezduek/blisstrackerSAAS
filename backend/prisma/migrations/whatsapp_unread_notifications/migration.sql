-- Avisos de WhatsApp por chat sin leer: el aviso apunta a la conversación, así hay
-- uno solo por chat y por persona y se marca leído cuando alguien abre el chat.
ALTER TABLE "Notification" ADD COLUMN "whatsappConversationId" INTEGER;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_whatsappConversationId_fkey"
  FOREIGN KEY ("whatsappConversationId") REFERENCES "WhatsappConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Notification_whatsappConversationId_idx" ON "Notification"("whatsappConversationId");
