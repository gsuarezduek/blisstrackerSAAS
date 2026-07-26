-- CreateTable: LeadAction reemplaza a Lead.nextActionTitle/nextActionDueAt/nextActionOwnerId
-- (una única acción por lead) por una tabla que admite varias, y que conserva
-- como historial las que ya se resolvieron (status 'done' + doneAt/doneBy).
CREATE TABLE "LeadAction" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "ownerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "doneAt" TIMESTAMP(3),
    "doneById" INTEGER,
    "taskId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadAction_taskId_key" ON "LeadAction"("taskId");
CREATE INDEX "LeadAction_workspaceId_idx" ON "LeadAction"("workspaceId");
CREATE INDEX "LeadAction_leadId_idx" ON "LeadAction"("leadId");
CREATE INDEX "LeadAction_workspaceId_status_dueAt_idx" ON "LeadAction"("workspaceId", "status", "dueAt");

-- AddForeignKey
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAction" ADD CONSTRAINT "LeadAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: la próxima acción única que ya tenía cada lead pasa a ser su primera LeadAction pendiente.
INSERT INTO "LeadAction" ("workspaceId", "leadId", "title", "dueAt", "ownerId", "status", "createdAt", "updatedAt")
SELECT "workspaceId", "id", "nextActionTitle", "nextActionDueAt", "nextActionOwnerId", 'pending', COALESCE("updatedAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM "Lead"
WHERE "nextActionTitle" IS NOT NULL AND trim("nextActionTitle") <> '';

-- AlterTable: Lead pierde los campos de próxima acción única (reemplazados por LeadAction).
-- DROP COLUMN elimina también la FK "Lead_nextActionOwnerId_fkey" definida sobre esa columna.
ALTER TABLE "Lead" DROP COLUMN "nextActionTitle";
ALTER TABLE "Lead" DROP COLUMN "nextActionDueAt";
ALTER TABLE "Lead" DROP COLUMN "nextActionOwnerId";

-- AlterTable: Workspace.salesTasksProjectId — proyecto donde se crean las tareas futuras
-- auto-generadas por las próximas acciones de leads (que todavía no tienen proyecto propio).
ALTER TABLE "Workspace" ADD COLUMN "salesTasksProjectId" INTEGER;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_salesTasksProjectId_fkey" FOREIGN KEY ("salesTasksProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
