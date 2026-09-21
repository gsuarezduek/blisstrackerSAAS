-- Estado binario Yjs (CRDT) para el editor colaborativo en tiempo real de notas
-- de reuniones (ver backend/src/lib/collab/). Las columnas `notes` (HTML) existentes
-- no cambian: siguen siendo la proyección legible que consumen reportes, el portal
-- de cliente, etc. — se derivan de `notesYdoc` en cada guardado colaborativo.
ALTER TABLE "ProjectMeeting" ADD COLUMN "notesYdoc" BYTEA;
ALTER TABLE "Lead" ADD COLUMN "notesYdoc" BYTEA;
ALTER TABLE "EOSMeeting" ADD COLUMN "notesYdoc" BYTEA;
