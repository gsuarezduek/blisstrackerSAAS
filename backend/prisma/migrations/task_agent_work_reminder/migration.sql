-- Agentes IA: recordatorio de registrar la tarea en curso (mcp/workReminder.js).
-- Cada cuántos minutos, como mucho, se le recuerda a un agente sin tarea en curso; 0 = nunca.
ALTER TABLE "McpToken" ADD COLUMN "workReminderMins" INTEGER NOT NULL DEFAULT 30;
