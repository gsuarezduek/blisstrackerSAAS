-- Nuevo valor del enum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMMENT';

-- Nueva tabla de comentarios de tareas
CREATE TABLE "TaskComment" (
    "id"        SERIAL PRIMARY KEY,
    "taskId"    INTEGER NOT NULL,
    "userId"    INTEGER NOT NULL,
    "content"   TEXT NOT NULL,
    "parentId"  INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");
