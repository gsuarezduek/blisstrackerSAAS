-- Una ContentPiece pasa por varios responsables/tareas a lo largo de su vida
-- (ej. CM arma el copy, diseñador arma el reel, CM revisa, CM publica) — la
-- relación 1:1 anterior (ContentPiece.taskId) solo soportaba una tarea para
-- toda la vida de la pieza. Se invierte el lado dueño del FK: ahora es
-- Task.contentPieceId (SIN unique), así una pieza puede acumular muchas Task.

-- AddColumn
ALTER TABLE "Task" ADD COLUMN "contentPieceId" INTEGER;

-- Backfill: cada Task que ya estaba vinculada 1:1 conserva su pieza.
UPDATE "Task" t
SET "contentPieceId" = cp."id"
FROM "ContentPiece" cp
WHERE cp."taskId" = t."id";

-- CreateIndex
CREATE INDEX "Task_contentPieceId_idx" ON "Task"("contentPieceId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contentPieceId_fkey" FOREIGN KEY ("contentPieceId") REFERENCES "ContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "ContentPiece" DROP CONSTRAINT IF EXISTS "ContentPiece_taskId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "ContentPiece_taskId_key";

-- DropColumn
ALTER TABLE "ContentPiece" DROP COLUMN "taskId";
