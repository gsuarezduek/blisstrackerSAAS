-- Aviso en la campana cuando la conexión de Google Calendar de una persona se cae
-- (token vencido/revocado, o conectada sin el permiso del calendario). Antes el
-- error quedaba solo en el modal "Mis calendarios" y el cron reintentaba cada
-- 15 min para siempre. Ver services/googleCalendarToken.service.js#markNeedsReconnect.
--
-- GoogleCalendarConnection.status suma el valor "missing_scope", pero es un String:
-- no hace falta migración para eso.

-- El ADD VALUE va solo: en Postgres un valor de enum recién agregado no puede
-- usarse en la misma transacción.
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR_CONNECTION';
