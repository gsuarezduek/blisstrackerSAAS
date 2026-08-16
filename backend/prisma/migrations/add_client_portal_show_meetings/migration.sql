-- AlterTable: opt-in para exponer la próxima reunión con el cliente (fecha +
-- título, sin notas internas) en la nueva pestaña "Inicio" del portal.
ALTER TABLE "ProjectClientPortal" ADD COLUMN "showMeetings" BOOLEAN NOT NULL DEFAULT false;
