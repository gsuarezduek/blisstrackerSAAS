-- @@unique([recurrenceId, scheduledFor]) en Task: sin esto, dos requests
-- concurrentes a GET /api/workdays/today podían materializar dos veces la misma
-- ocurrencia de una tarea recurrente (condición de carrera en topUpUserRecurrences).
CREATE UNIQUE INDEX "Task_recurrenceId_scheduledFor_key" ON "Task"("recurrenceId", "scheduledFor");
