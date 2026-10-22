-- Agentes IA (MCP) en WhatsApp: mensaje escrito por un agente (el remitente sigue
-- siendo su dueño, senderUserId) y qué agente tiene tomada la conversación. SetNull:
-- si el token se borra, el mensaje queda como de la persona y la conversación sin agente.
ALTER TABLE "WhatsappMessage" ADD COLUMN "senderAgentId" INTEGER;
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_senderAgentId_fkey" FOREIGN KEY ("senderAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsappConversation" ADD COLUMN "agentControlId" INTEGER;
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_agentControlId_fkey" FOREIGN KEY ("agentControlId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prioridad a los agentes: el bot puede esperar N minutos antes de responder
-- (WhatsappBotConfig.agentWaitMins) y la respuesta pendiente queda agendada en la
-- conversación (botReplyDueAt), consumida por un cron de cada minuto.
ALTER TABLE "WhatsappBotConfig" ADD COLUMN "agentWaitMins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsappConversation" ADD COLUMN "botReplyDueAt" TIMESTAMP(3);
CREATE INDEX "WhatsappConversation_botReplyDueAt_idx" ON "WhatsappConversation"("botReplyDueAt");

-- Nombre que declara el agente (param opcional `agentName` de las tools MCP): varios
-- agentes de un mismo cliente (ej. Grok) pueden compartir un token; esto los distingue.
-- Autodeclarado, no verificable: se muestra junto al nombre del token ("grokbot · Ventas").
ALTER TABLE "Task" ADD COLUMN "createdByAgentName" TEXT, ADD COLUMN "agentName" TEXT;
ALTER TABLE "TaskRecurrence" ADD COLUMN "createdByAgentName" TEXT, ADD COLUMN "agentName" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN "agentName" TEXT;
ALTER TABLE "ProjectSituationEntry" ADD COLUMN "createdByAgentName" TEXT, ADD COLUMN "updatedByAgentName" TEXT;
ALTER TABLE "WhatsappMessage" ADD COLUMN "senderAgentName" TEXT;
ALTER TABLE "WhatsappConversation" ADD COLUMN "agentControlName" TEXT;
