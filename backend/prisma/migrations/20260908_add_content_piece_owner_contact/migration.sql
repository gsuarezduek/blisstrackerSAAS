-- Contenido: el "Responsable" de una pieza puede ser el cliente (ej. "está en
-- su cancha, esperando su aprobación"), no solo un miembro interno del equipo.
-- Mutuamente excluyente con ownerId — se aplica en la app (buildPieceData),
-- no hay CHECK de DB, mismo criterio liviano que el resto del modelo.
ALTER TABLE "ContentPiece" ADD COLUMN "ownerContactId" INTEGER;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "ClientPortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
