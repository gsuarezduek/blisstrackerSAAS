-- Calendarios de AFUERA traídos a BlissTracker (el camino inverso al push a Google
-- Calendar que ya existía). Dos fuentes, un solo modelo: "google" (lee del
-- GoogleCalendarConnection ya conectado — el scope calendar.events ya es de lectura
-- y escritura, así que no hace falta consentimiento nuevo) y "ics" (una URL iCal
-- pegada a mano, de Google/Outlook/Apple; va cifrada porque ese link es una llave:
-- con él cualquiera lee la agenda entera).
--
-- ExternalCalendarEvent es CACHE: la vista Equipo con 6 personas serían 6 llamadas
-- de red por render, y getBusyBlocks necesita los eventos de todos para buscar
-- huecos comunes. Las fechas se guardan como strings de pared en la tz del
-- workspace (mismo criterio que WorkDay.date / CalendarEvent): el instante UTC que
-- devuelven Google y los ICS se convierte una sola vez, al sincronizar.

-- CreateTable
CREATE TABLE "ExternalCalendar" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icsUrl" TEXT,
    "icsHost" TEXT,
    "googleCalendarId" TEXT,
    "color" TEXT,
    "showDetails" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastSyncCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCalendarEvent" (
    "id" SERIAL NOT NULL,
    "calendarId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startTime" TEXT,
    "durationMins" INTEGER,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "busy" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalCalendar_workspaceId_userId_idx" ON "ExternalCalendar"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ExternalCalendar_active_lastSyncAt_idx" ON "ExternalCalendar"("active", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendar_userId_workspaceId_source_googleCalendarId_key" ON "ExternalCalendar"("userId", "workspaceId", "source", "googleCalendarId");

-- CreateIndex
CREATE INDEX "ExternalCalendarEvent_workspaceId_userId_date_idx" ON "ExternalCalendarEvent"("workspaceId", "userId", "date");

-- CreateIndex
CREATE INDEX "ExternalCalendarEvent_calendarId_date_idx" ON "ExternalCalendarEvent"("calendarId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendarEvent_calendarId_externalId_key" ON "ExternalCalendarEvent"("calendarId", "externalId");

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ExternalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

