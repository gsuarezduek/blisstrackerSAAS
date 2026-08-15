-- Notificaciones del módulo Contenido.
-- Los ADD VALUE van solos, sin ningún statement que los consuma: en Postgres un
-- valor de enum recién agregado no puede usarse en la misma transacción
-- (mismo patrón que add_notification_game_launched).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTENT_MENTION';

-- AlterTable
-- actorId pasa a nullable: el actor de una aprobación es un contacto del cliente
-- (ClientPortalContact), que no es un User. En esos casos el `message` es
-- autocontenido e incluye el nombre de quien actuó.
ALTER TABLE "Notification" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "contentPieceId" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_contentPieceId_fkey" FOREIGN KEY ("contentPieceId") REFERENCES "ContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;
