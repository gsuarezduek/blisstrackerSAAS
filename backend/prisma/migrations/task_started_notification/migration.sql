-- Aviso a quienes siguen o delegaron una tarea cuando su responsable la inicia
-- (PENDING → IN_PROGRESS). Ver startTask en tasks/lifecycle.controller.js.
--
-- El ADD VALUE va solo, sin ningún statement que lo consuma: en Postgres un
-- valor de enum recién agregado no puede usarse en la misma transacción.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STARTED';
