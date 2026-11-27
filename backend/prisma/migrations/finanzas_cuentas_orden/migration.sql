-- Finanzas: orden manual de las cuentas (Configuración → arrastrar). Backfill
-- con el orden que se veía hasta ahora (alfabético por workspace), así nada
-- cambia de lugar hasta que alguien lo reordene.
ALTER TABLE "FinanceAccount" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "FinanceAccount" a
SET "sortOrder" = s.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "workspaceId" ORDER BY name ASC, id ASC) - 1)::int AS rn
  FROM "FinanceAccount"
) s
WHERE a.id = s.id;
