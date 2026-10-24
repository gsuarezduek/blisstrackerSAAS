-- Vínculo (auditId, itemIndex) -> taskId: qué recomendación de un GeoAudit ya
-- tiene una tarea creada. No duplica estado (se lee de Task.status); si se
-- borra la tarea el vínculo cae con ella (CASCADE), el finding vuelve a no
-- tener tarea asociada.
CREATE TABLE "GeoFindingTask" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "auditId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'finding',
    "itemIndex" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoFindingTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeoFindingTask_taskId_key" ON "GeoFindingTask"("taskId");

CREATE UNIQUE INDEX "GeoFindingTask_auditId_kind_itemIndex_key" ON "GeoFindingTask"("auditId", "kind", "itemIndex");

CREATE INDEX "GeoFindingTask_workspaceId_idx" ON "GeoFindingTask"("workspaceId");

CREATE INDEX "GeoFindingTask_auditId_idx" ON "GeoFindingTask"("auditId");

ALTER TABLE "GeoFindingTask" ADD CONSTRAINT "GeoFindingTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoFindingTask" ADD CONSTRAINT "GeoFindingTask_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoFindingTask" ADD CONSTRAINT "GeoFindingTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
