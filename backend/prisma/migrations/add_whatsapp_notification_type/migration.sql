-- Notificación cuando un contacto vinculado a un lead activo escribe por
-- WhatsApp (Fase 2 del plan de WhatsApp). ADD VALUE va solo, sin ningún
-- statement que lo consuma en la misma migración (mismo patrón que
-- add_notification_portal_login / add_content_notifications).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WHATSAPP_MESSAGE';
