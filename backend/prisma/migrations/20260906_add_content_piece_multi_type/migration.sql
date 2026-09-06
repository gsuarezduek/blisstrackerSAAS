-- Contenido: una pieza puede tener más de un formato (ej. "Historia + Post").
-- Mismo patrón que ContentPiece.networks: un array JSON serializado en vez de un solo valor.
ALTER TABLE "ContentPiece" ADD COLUMN "types" TEXT NOT NULL DEFAULT '[]';

-- Backfill: envuelve el valor de tipo único existente en un array de un elemento.
UPDATE "ContentPiece" SET "types" = '["' || "type" || '"]' WHERE "type" IS NOT NULL;

ALTER TABLE "ContentPiece" DROP COLUMN "type";
