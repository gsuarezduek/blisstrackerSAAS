-- Editar un acceso (ej. cambió la contraseña) y ver el historial de cambios.

-- Última modificación de la ficha del acceso: se muestra en la fila ("actualizado
-- el 12 oct") para saber de un vistazo si la credencial está fresca, sin abrir el
-- historial. Las filas que ya existen quedan con el momento de la migración.
ALTER TABLE "ProjectAccess" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Los accesos que ya existen nunca se editaron: igualarlos a su alta evita que
-- la ficha los muestre a todos como "editado hoy" el día del deploy.
UPDATE "ProjectAccess" SET "updatedAt" = "createdAt";

-- El log de reveals pasa a ser el historial completo del acceso: suma los cambios
-- (alta / edición / baja) a lo que ya registraba (quién vio una contraseña o un 2FA).
-- `field` deja de ser obligatorio porque solo aplica a un reveal (un dato), mientras
-- que una edición toca un conjunto de campos (`fields`). NUNCA se guardan valores:
-- de una contraseña queda QUE cambió, no a qué.
-- `label` congela el nombre de la cuenta: al borrar el acceso el FK va a NULL
-- (SetNull, para conservar el historial) y sin esto la fila quedaría sin referencia.
ALTER TABLE "ProjectAccessLog" ADD COLUMN "action" TEXT NOT NULL DEFAULT 'reveal';
ALTER TABLE "ProjectAccessLog" ADD COLUMN "fields" JSONB;
ALTER TABLE "ProjectAccessLog" ADD COLUMN "label" TEXT;
ALTER TABLE "ProjectAccessLog" ALTER COLUMN "field" DROP NOT NULL;

-- El historial se lee por proyecto, más nuevo primero y con límite: el índice
-- compuesto cubre también las búsquedas por projectId solo, así que reemplaza al simple.
DROP INDEX IF EXISTS "ProjectAccessLog_projectId_idx";
CREATE INDEX "ProjectAccessLog_projectId_createdAt_idx" ON "ProjectAccessLog"("projectId", "createdAt");
