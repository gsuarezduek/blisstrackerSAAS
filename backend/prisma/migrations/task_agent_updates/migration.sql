-- Agentes IA: bandeja de novedades del agente que creó una tarea (GET /tasks/agent-updates).
-- createdByAgentSeenAt = cuándo el agente se enteró de que se completó.
ALTER TABLE "Task" ADD COLUMN "createdByAgentSeenAt" TIMESTAMP(3);

-- Lo ya completado antes de esta migración cuenta como visto: el primer llamado del
-- agente no tiene que traer todo el historial.
UPDATE "Task" SET "createdByAgentSeenAt" = NOW()
WHERE "createdByAgentId" IS NOT NULL AND "status" = 'COMPLETED';

-- Consulta de la bandeja: tareas de un agente, completadas y sin ver.
CREATE INDEX "Task_createdByAgentId_status_createdByAgentSeenAt_idx" ON "Task"("createdByAgentId", "status", "createdByAgentSeenAt");
