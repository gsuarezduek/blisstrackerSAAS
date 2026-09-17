-- Módulo Calendario: disponibilidad interna del equipo (horario laboral + tareas con
-- hora + reuniones agendadas con invitación/aceptación). Ver CalendarEvent /
-- CalendarEventParticipant más abajo.
--
-- Los ADD VALUE van solos, sin ningún statement que los consuma: en Postgres un
-- valor de enum recién agregado no puede usarse en la misma transacción (mismo
-- patrón que add_content_notifications / add_whatsapp_notification_type).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_RESPONSE';

-- AlterTable: bloqueo horario opcional de una tarea (normal o futura) en el Calendario.
ALTER TABLE "Task" ADD COLUMN "scheduledTime" TEXT;
ALTER TABLE "Task" ADD COLUMN "scheduledDurationMins" INTEGER;

-- AlterTable: mismo bloqueo horario, copiado a cada instancia generada por la recurrencia.
ALTER TABLE "TaskRecurrence" ADD COLUMN "scheduledTime" TEXT;
ALTER TABLE "TaskRecurrence" ADD COLUMN "scheduledDurationMins" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "calendarEventId" INTEGER;

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "projectId" INTEGER,
    "meetLink" TEXT,
    "notes" TEXT,
    "realMeetingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventParticipant" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_realMeetingId_key" ON "CalendarEvent"("realMeetingId");

-- CreateIndex
CREATE INDEX "CalendarEvent_workspaceId_date_idx" ON "CalendarEvent"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizerId_idx" ON "CalendarEvent"("organizerId");

-- CreateIndex
CREATE INDEX "CalendarEvent_projectId_idx" ON "CalendarEvent"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventParticipant_eventId_userId_key" ON "CalendarEventParticipant"("eventId", "userId");

-- CreateIndex
CREATE INDEX "CalendarEventParticipant_eventId_idx" ON "CalendarEventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "CalendarEventParticipant_userId_status_idx" ON "CalendarEventParticipant"("userId", "status");

-- CreateIndex
CREATE INDEX "CalendarEventParticipant_workspaceId_idx" ON "CalendarEventParticipant"("workspaceId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_realMeetingId_fkey" FOREIGN KEY ("realMeetingId") REFERENCES "ProjectMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventParticipant" ADD CONSTRAINT "CalendarEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventParticipant" ADD CONSTRAINT "CalendarEventParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventParticipant" ADD CONSTRAINT "CalendarEventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
