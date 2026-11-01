-- Agentes IA (MCP): canales de SALIDA hacia el agente. MCP es unidireccional (el agente
-- nos llama, nunca al revés), así que hasta acá lo único que llegaba a un agente era lo
-- que él mismo iba a buscar. Dos vías, las dos opt-in por token:
--   1. Webhook firmado (HMAC-SHA256) a una URL del usuario — para un agente que corra en
--      algún lado y pueda recibir un POST.
--   2. Despertador: el backend invoca al agente por la API del proveedor (hoy xAI) con
--      las tools de BlissTracker, usando la API key del workspace (cifrada).
-- Ver services/agentNotify.service.js, que dispara las dos desde un solo lugar.
ALTER TABLE "McpToken" ADD COLUMN "webhookUrl" TEXT;
ALTER TABLE "McpToken" ADD COLUMN "webhookSecret" TEXT;
ALTER TABLE "McpToken" ADD COLUMN "webhookLastAt" TIMESTAMP(3);
ALTER TABLE "McpToken" ADD COLUMN "webhookLastStatus" TEXT;
ALTER TABLE "McpToken" ADD COLUMN "wakeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "McpToken" ADD COLUMN "wakeLastAt" TIMESTAMP(3);
ALTER TABLE "McpToken" ADD COLUMN "wakeLastStatus" TEXT;

-- API key del proveedor para el despertador. Cifrada con AES-256-GCM (lib/encryption.js),
-- mismo mecanismo que los tokens de ProjectIntegration: nunca en claro en la DB.
ALTER TABLE "Workspace" ADD COLUMN "agentWakeApiKey" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "agentWakeModel" TEXT;
