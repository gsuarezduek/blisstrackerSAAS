-- Quién cargó una credencial y quién la tocó última, a la vista en la lista de
-- accesos. Van en la fila y no se derivan del log porque la lista no puede
-- depender de traer el historial de cada acceso.
ALTER TABLE "ProjectAccess" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "ProjectAccess" ADD COLUMN "updatedById" INTEGER;

-- SetNull y no Cascade: si la persona se va del sistema, la credencial del
-- cliente no se borra con ella — queda sin autor, que es la verdad.
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectAccess_createdById_idx" ON "ProjectAccess"("createdById");
CREATE INDEX "ProjectAccess_updatedById_idx" ON "ProjectAccess"("updatedById");

-- Backfill con lo que el historial ya sabe: todo acceso cargado o editado desde
-- que existe el log de cambios tiene ahí a su autor. Los más viejos quedan en
-- NULL (el log sólo guardaba reveals) y la ficha no muestra autor, en vez de
-- atribuirle el dato a quien lo miró.
UPDATE "ProjectAccess" a
   SET "createdById" = l."userId"
  FROM "ProjectAccessLog" l
 WHERE l."accessId" = a."id" AND l."action" = 'create';

UPDATE "ProjectAccess" a
   SET "updatedById" = last."userId"
  FROM (
    SELECT DISTINCT ON ("accessId") "accessId", "userId"
      FROM "ProjectAccessLog"
     WHERE "action" = 'update' AND "accessId" IS NOT NULL
     ORDER BY "accessId", "createdAt" DESC
  ) last
 WHERE last."accessId" = a."id";
