-- Servicios: descripción de qué incluye cada uno, para que la IA la use al generar propuestas.
ALTER TABLE "Service" ADD COLUMN "description" TEXT;

-- Propuestas: planes de precio (2+ opciones con servicios y precio mensual distintos, ej. Básico/Completo).
ALTER TABLE "Proposal" ADD COLUMN "plans" JSONB NOT NULL DEFAULT '[]';
