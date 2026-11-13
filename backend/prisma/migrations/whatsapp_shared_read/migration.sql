-- Leído compartido por todo el equipo en las conversaciones de WhatsApp
-- (antes era por persona, en "WhatsappConversationRead").
ALTER TABLE "WhatsappConversation" ADD COLUMN "lastReadMessageId" INTEGER;
ALTER TABLE "WhatsappConversation" ADD COLUMN "lastReadAt" TIMESTAMP(3);
ALTER TABLE "WhatsappConversation" ADD COLUMN "markedUnreadAt" TIMESTAMP(3);

-- Backfill: lo que ALGUIEN del equipo ya vio queda visto para todos.
UPDATE "WhatsappConversation" c
SET "lastReadMessageId" = r."maxRead", "lastReadAt" = r."maxAt"
FROM (
  SELECT "conversationId", MAX("lastReadMessageId") AS "maxRead", MAX("lastReadAt") AS "maxAt"
  FROM "WhatsappConversationRead"
  GROUP BY "conversationId"
) r
WHERE r."conversationId" = c.id;
