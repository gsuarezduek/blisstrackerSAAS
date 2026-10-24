-- Token público de bajo privilegio que identifica el workspace para el intake
-- público de Leads desde integraciones externas (ej. WP Webhooks + Contact Form 7,
-- POST /api/public/leads/:token). Nullable — null = integración desactivada.
-- Texto plano en DB (no hasheado como McpToken): solo permite crear un Lead,
-- no leer nada. Mismo criterio que ProjectFile.publicToken / MonthlyReport.token.

-- AddColumn
ALTER TABLE "Workspace" ADD COLUMN "leadWebhookToken" TEXT;

-- CreateIndex (Postgres permite múltiples NULL en un índice único)
CREATE UNIQUE INDEX "Workspace_leadWebhookToken_key" ON "Workspace"("leadWebhookToken");
