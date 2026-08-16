-- AlterTable: opt-in para exponer el equipo del proyecto (ProjectMember:
-- foto/nombre/rol) en la nueva pestaña "Tu equipo" del portal de cliente.
ALTER TABLE "ProjectClientPortal" ADD COLUMN "showTeam" BOOLEAN NOT NULL DEFAULT false;
