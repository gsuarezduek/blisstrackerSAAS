-- CalendarEventParticipant.taskId: vincula la Task "reserva" del dashboard creada
-- al aceptar una invitación de Calendario (ver lib/calendarEventTasks.js). El
-- proyecto de la reunión pasa a ser obligatorio a nivel de aplicación desde este
-- cambio (validado en calendar.controller.js), pero la columna sigue nullable en
-- CalendarEvent por compatibilidad con eventos legacy.

-- AlterTable
ALTER TABLE "CalendarEventParticipant" ADD COLUMN "taskId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventParticipant_taskId_key" ON "CalendarEventParticipant"("taskId");

-- AddForeignKey
ALTER TABLE "CalendarEventParticipant" ADD CONSTRAINT "CalendarEventParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
