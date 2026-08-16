-- AlterTable: opt-in para exponer el cumplimiento de objetivos
-- (MarketingObjective, computeObjectives en vivo) arriba de las tarjetas
-- en la pestaña "Inicio" del portal de cliente.
ALTER TABLE "ProjectClientPortal" ADD COLUMN "showObjectives" BOOLEAN NOT NULL DEFAULT false;
