-- CalendarEventRecurrence.autoAcceptUserIds: aceptar una ocurrencia de una serie
-- recurrente acepta automáticamente toda la serie (no hay que confirmar semana
-- por semana). Ver respondEventAcceptSeries en calendar.controller.js.

-- AlterTable
ALTER TABLE "CalendarEventRecurrence" ADD COLUMN "autoAcceptUserIds" TEXT NOT NULL DEFAULT '[]';
