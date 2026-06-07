-- AlterTable: campos de tareas futuras/recurrentes en Task
ALTER TABLE "Task" ADD COLUMN "scheduledFor" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceId" INTEGER;

-- CreateTable: plantilla de recurrencia
CREATE TABLE "TaskRecurrence" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "projectId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL DEFAULT '[]',
    "dayOfMonth" INTEGER,
    "month" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "lastSpawnedDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_userId_scheduledFor_idx" ON "Task"("userId", "scheduledFor");
CREATE INDEX "Task_recurrenceId_idx" ON "Task"("recurrenceId");
CREATE INDEX "TaskRecurrence_workspaceId_active_idx" ON "TaskRecurrence"("workspaceId", "active");
CREATE INDEX "TaskRecurrence_userId_active_idx" ON "TaskRecurrence"("userId", "active");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
