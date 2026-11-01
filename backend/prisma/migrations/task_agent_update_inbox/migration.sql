-- Agentes IA (MCP): bandeja de novedades del agente EJECUTOR. MCP es unidireccional
-- (nunca iniciamos una conversación con el agente), así que lo que la persona le deja
-- desde la app — desbloquear ('unblocked') o comentar ('comment') una tarea de agente —
-- queda marcado acá y el agente se entera al revisar GET /tasks/agent-updates, que la
-- limpia al devolverla. Lo que hace el agente mismo no la marca: ya lo sabe.
ALTER TABLE "Task" ADD COLUMN "agentUpdateAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "agentUpdateKind" TEXT;

CREATE INDEX "Task_userId_isAgentTask_agentUpdateAt_idx" ON "Task"("userId", "isAgentTask", "agentUpdateAt");
