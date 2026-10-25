-- Notifica a todo el equipo con acceso al módulo Ventas cuando el intake
-- público de Leads (webhook del formulario web) crea un Lead nuevo.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_CREATED';
