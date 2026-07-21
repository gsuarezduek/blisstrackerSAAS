-- Secciones de Marketing habilitadas por proyecto para el informe (config por proyecto,
-- ej: un proyecto sin web no ofrece "Performance web"/"GEO" al generar el informe).
-- null = sin restricción (comportamiento legacy: se ofrecen todas las disponibles).
ALTER TABLE "Project" ADD COLUMN "reportSections" TEXT;
