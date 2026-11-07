-- Detalle de un evento traído de afuera: lo que hace falta para contestar "¿de qué
-- era esta reunión?" sin salir de BlissTracker. Antes solo se guardaba título,
-- horario y ubicación, así que el bloque de la grilla no tenía nada más que mostrar
-- al abrirlo (y con el título truncado, a veces ni se leía qué era).
--
-- No necesita backfill: cada sync reemplaza entero el cache de su calendario, así
-- que los eventos ya traídos se completan solos en el próximo refresco.

-- AlterTable
ALTER TABLE "ExternalCalendarEvent" ADD COLUMN     "description" TEXT,
ADD COLUMN     "meetLink" TEXT,
ADD COLUMN     "organizer" TEXT;

