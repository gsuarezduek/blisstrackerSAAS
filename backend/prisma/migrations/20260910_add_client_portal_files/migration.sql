-- Tab "Archivos" (solo lectura) en el portal de cliente: reutiliza el mismo
-- repositorio ProjectFile que ve el equipo interno, gateado por este opt-in
-- (mismo patrón que showTeam/showObjectives/showMeetings).

-- AlterTable
ALTER TABLE "ProjectClientPortal" ADD COLUMN "showFiles" BOOLEAN NOT NULL DEFAULT false;
