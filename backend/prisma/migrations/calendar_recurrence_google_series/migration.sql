-- Serie de reuniones espejada en Google como UN evento recurrente (RRULE), en vez de
-- un evento suelto por ocurrencia (que mandaba una invitación por fecha).
ALTER TABLE "CalendarEventRecurrence" ADD COLUMN "googleEventId" TEXT;
ALTER TABLE "CalendarEventRecurrence" ADD COLUMN "googleStartDate" TEXT;
