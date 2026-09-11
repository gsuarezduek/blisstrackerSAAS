-- El ADD VALUE va solo, sin ningún statement que lo consuma: en Postgres un valor
-- de enum recién agregado no puede usarse en la misma transacción (mismo patrón
-- que add_content_notifications).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DELETED';

-- CreateTable
-- Log de auditoría: snapshot de una tarea delegada (createdById != userId) que
-- alguien borró. No referencia a Task (ya no existe al crearse esta fila) —
-- permite avisarle al delegante y que la vea marcada como "eliminada" en su
-- seguimiento ("Delegadas"), sin convertir el borrado de Task en un soft-delete
-- estructural.
CREATE TABLE "DeletedTaskNotice" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "description" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "deletedById" INTEGER NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedTaskNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedTaskNotice_workspaceId_createdById_dismissed_idx" ON "DeletedTaskNotice"("workspaceId", "createdById", "dismissed");

-- AddForeignKey
ALTER TABLE "DeletedTaskNotice" ADD CONSTRAINT "DeletedTaskNotice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedTaskNotice" ADD CONSTRAINT "DeletedTaskNotice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedTaskNotice" ADD CONSTRAINT "DeletedTaskNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedTaskNotice" ADD CONSTRAINT "DeletedTaskNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedTaskNotice" ADD CONSTRAINT "DeletedTaskNotice_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
