-- Vínculo To-Do de L10 ↔ Task del dashboard (uno a uno, SetNull al borrar la tarea)
ALTER TABLE "EOSTodo" ADD COLUMN "taskId" INTEGER;
CREATE UNIQUE INDEX "EOSTodo_taskId_key" ON "EOSTodo"("taskId");
ALTER TABLE "EOSTodo" ADD CONSTRAINT "EOSTodo_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
