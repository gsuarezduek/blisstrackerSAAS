-- Aviso al equipo la primera vez que un contacto del portal de cliente hace
-- login exitoso. ADD VALUE va solo, sin ningún statement que lo consuma: en
-- Postgres un valor de enum recién agregado no puede usarse en la misma
-- transacción (mismo patrón que add_content_notifications).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PORTAL_CLIENT_LOGIN';
