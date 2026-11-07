-- Invitados de un evento traído de afuera. Son datos personales de terceros (hay
-- mails de gente que puede no estar en el workspace), así que —igual que la
-- descripción— solo se le muestran a su dueño, ni siquiera con showDetails puesto.
--
-- `attendeeCount` guarda cuántos eran en total aunque la lista venga recortada:
-- con el tope, "12 invitados" seguiría diciendo la verdad en una reunión de 200.
--
-- Sin backfill: cada sync reemplaza entero el cache de su calendario.

-- AlterTable
ALTER TABLE "ExternalCalendarEvent" ADD COLUMN     "attendeeCount" INTEGER,
ADD COLUMN     "attendees" JSONB;

