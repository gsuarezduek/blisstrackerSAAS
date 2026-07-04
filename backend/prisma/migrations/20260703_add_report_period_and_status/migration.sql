-- Rango de fechas explícito + estado borrador/publicado para los informes mensuales.
-- El informe pasa a nombrarse por su período (periodStart/End). `month` queda como
-- ancla estable de id/URL. Informes legacy (periodStart null) → se deriva del mes completo.

ALTER TABLE "MonthlyReport" ADD COLUMN "periodStart" TIMESTAMP(3);
ALTER TABLE "MonthlyReport" ADD COLUMN "periodEnd"   TIMESTAMP(3);
ALTER TABLE "MonthlyReport" ADD COLUMN "status"      TEXT NOT NULL DEFAULT 'draft';

-- Los informes ya existentes se consideran publicados (no romper links vivos ya compartidos).
UPDATE "MonthlyReport" SET "status" = 'published';
