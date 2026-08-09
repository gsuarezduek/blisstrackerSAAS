-- Informe de diagnóstico para el cliente, generado a partir de la investigación IA
-- (LeadResearch.result) y exportable a PDF, como paso previo a la propuesta.
ALTER TABLE "LeadResearch" ADD COLUMN "reportTitle" TEXT;
ALTER TABLE "LeadResearch" ADD COLUMN "reportHtml" TEXT;
