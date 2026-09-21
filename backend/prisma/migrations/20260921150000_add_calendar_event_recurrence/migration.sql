-- CalendarEventRecurrence: plantilla de una serie de reuniones recurrentes
-- ("reunión de EOS todos los lunes a las 9"). Cada ocurrencia visible sigue
-- siendo un CalendarEvent real (con sus propios participantes/aceptaciones),
-- materializado bajo demanda por calendarEventRecurrence.service.js. Ver
-- concepto "Calendario" en CLAUDE.md.

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "recurrenceId" INTEGER;

-- CreateTable
CREATE TABLE "CalendarEventRecurrence" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "meetLink" TEXT,
    "notes" TEXT,
    "startTime" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "participantIds" TEXT NOT NULL DEFAULT '[]',
    "frequency" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL DEFAULT '[]',
    "dayOfMonth" INTEGER,
    "month" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventException" (
    "id" SERIAL NOT NULL,
    "recurrenceId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventRecurrence_workspaceId_active_idx" ON "CalendarEventRecurrence"("workspaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventException_recurrenceId_date_key" ON "CalendarEventException"("recurrenceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_recurrenceId_date_key" ON "CalendarEvent"("recurrenceId", "date");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "CalendarEventRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecurrence" ADD CONSTRAINT "CalendarEventRecurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecurrence" ADD CONSTRAINT "CalendarEventRecurrence_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecurrence" ADD CONSTRAINT "CalendarEventRecurrence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventException" ADD CONSTRAINT "CalendarEventException_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "CalendarEventRecurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
