-- Reemplaza LandingContent.heroTitleAccent (frase completa "de tu agencia.") por
-- heroTitleAccentWords (array de palabras que rotan con efecto typewriter en el
-- hero de la landing) — "de tu " y "." quedan fijos en el frontend, solo la
-- palabra central se anima. Ver concepto "Landing" en CLAUDE.md.
ALTER TABLE "LandingContent" ADD COLUMN "heroTitleAccentWords" JSONB NOT NULL DEFAULT '["agencia","negocio","equipo","empresa"]';

-- Backfill: si la fila existente tenía una frase con el patrón "de tu <palabra>."
-- editado a mano, se extrae solo la palabra; si no matchea el patrón, se deja el
-- default de arriba (no hay forma segura de adivinar la intención).
UPDATE "LandingContent"
SET "heroTitleAccentWords" = jsonb_build_array(
  TRIM(BOTH '.' FROM REGEXP_REPLACE("heroTitleAccent", '^\s*de\s+tu\s+', '', 'i'))
)
WHERE "heroTitleAccent" ~* '^\s*de\s+tu\s+\S+'
  AND TRIM(BOTH '.' FROM REGEXP_REPLACE("heroTitleAccent", '^\s*de\s+tu\s+', '', 'i')) <> '';

ALTER TABLE "LandingContent" DROP COLUMN "heroTitleAccent";
