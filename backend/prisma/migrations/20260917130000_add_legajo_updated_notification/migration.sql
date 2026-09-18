-- Notifica a los admins/owners del workspace cuando un usuario actualiza sus
-- datos de legajo (builtin o custom). Ver concepto "Legajo configurable".
--
-- El ADD VALUE va solo, sin ningún statement que lo consuma: en Postgres un
-- valor de enum recién agregado no puede usarse en la misma transacción
-- (mismo patrón que add_calendar_module / add_whatsapp_notification_type).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEGAJO_UPDATED';
