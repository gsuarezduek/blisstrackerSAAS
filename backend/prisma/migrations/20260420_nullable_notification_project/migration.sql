-- Hacer projectId nullable en Notification para permitir notificaciones no vinculadas a proyectos
ALTER TABLE "Notification" ALTER COLUMN "projectId" DROP NOT NULL;
