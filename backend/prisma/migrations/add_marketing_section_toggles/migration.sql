-- Secciones de Marketing togglables por workspace (rueda de configuración en /marketing)
-- + 2 avisos automáticos nuevos: digest semanal de Prioridades y opt-out de Alertas SEO.
ALTER TABLE "Workspace" ADD COLUMN "marketingDisabledSections" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Workspace" ADD COLUMN "marketingDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN "seoAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
