-- Agentes IA (MCP): tareas ejecutadas/creadas por un agente.
ALTER TABLE "Task" ADD COLUMN "isAgentTask" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "agentId" INTEGER;
ALTER TABLE "Task" ADD COLUMN "createdByAgentId" INTEGER;

ALTER TABLE "TaskRecurrence" ADD COLUMN "isAgentTask" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskRecurrence" ADD COLUMN "agentId" INTEGER;
ALTER TABLE "TaskRecurrence" ADD COLUMN "createdByAgentId" INTEGER;

ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_userId_isAgentTask_status_idx" ON "Task"("userId", "isAgentTask", "status");

-- "Una sola tarea en curso por persona" pasa a aplicar solo a tareas humanas:
-- un agente puede tener varias en curso sin ocupar el lugar de su dueño.
DROP INDEX "one_active_task_per_user";
CREATE UNIQUE INDEX "one_active_task_per_user"
ON "Task"("userId")
WHERE status = 'IN_PROGRESS' AND "isAgentTask" = false;
