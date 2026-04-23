-- Agregar campo connections (JSON) a Project para almacenar URLs de redes sociales y otras integraciones
ALTER TABLE "Project" ADD COLUMN "connections" TEXT NOT NULL DEFAULT '{}';
