-- Propuestas de Ventas como documento estructurado (bloques tipados) en vez de HTML libre.
-- `content` (HTML) queda para las propuestas existentes; las nuevas guardan `doc`.
ALTER TABLE "Proposal" ADD COLUMN "doc" JSONB;
