-- Salud del webhook de WhatsApp: detectar que Chakra dejó de mandar eventos
-- (pasó el 16/11/2026: 9 días sin mensajes nuevos con la cuenta "conectada").
-- Ver services/whatsappWebhookHealth.service.js.

-- El ADD VALUE va solo, sin ningún statement que lo consuma: en Postgres un valor
-- de enum recién agregado no puede usarse en la misma transacción.
ALTER TYPE "NotificationType" ADD VALUE 'WHATSAPP_CONNECTION';

ALTER TABLE "WhatsappAccount" ADD COLUMN "lastWebhookAt" TIMESTAMP(3);
ALTER TABLE "WhatsappAccount" ADD COLUMN "webhookHealth" TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE "WhatsappAccount" ADD COLUMN "webhookHealthSince" TIMESTAMP(3);
ALTER TABLE "WhatsappAccount" ADD COLUMN "webhookHealthNotifiedAt" TIMESTAMP(3);

-- Punto de partida: el último mensaje que llegó POR EL WEBHOOK (entrante o eco de
-- la app). Sin esto, las cuentas existentes arrancarían sin historia y la primera
-- corrida contaría el silencio desde que se conectaron.
UPDATE "WhatsappAccount" a
SET "lastWebhookAt" = m.last_at
FROM (
  SELECT c."accountId", MAX(msg."createdAt") AS last_at
  FROM "WhatsappMessage" msg
  JOIN "WhatsappConversation" c ON c.id = msg."conversationId"
  WHERE msg.direction = 'in' OR msg."senderType" = 'app_echo'
  GROUP BY c."accountId"
) m
WHERE m."accountId" = a.id;
