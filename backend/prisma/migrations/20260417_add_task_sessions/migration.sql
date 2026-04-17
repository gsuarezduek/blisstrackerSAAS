CREATE TABLE "TaskSession" (
  "id"        SERIAL PRIMARY KEY,
  "taskId"    INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt"   TIMESTAMP(3),
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE
);
CREATE INDEX "TaskSession_taskId_idx"    ON "TaskSession"("taskId");
CREATE INDEX "TaskSession_startedAt_idx" ON "TaskSession"("startedAt");
