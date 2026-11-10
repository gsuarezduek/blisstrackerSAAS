-- Inventario SEO del blog: lo que hace falta para que una pieza publicada deje
-- de ser una fila del calendario y pase a ser una nota medible.
--
-- Todo opcional y sin backfill: las piezas que ya existen no cambian. El idioma
-- NO se deduce de la URL acá (la importación sí lo hace, pero eso es una
-- decisión por proyecto, no algo que se pueda inventar sobre lo ya cargado).
ALTER TABLE "ContentPiece" ADD COLUMN "language" TEXT;
ALTER TABLE "ContentPiece" ADD COLUMN "seoKeyword" TEXT;
ALTER TABLE "ContentPiece" ADD COLUMN "seoKeywords" TEXT NOT NULL DEFAULT '[]';
-- Id compartido por las traducciones de una misma nota. No es un FK a la
-- "original" porque entre traducciones no hay jerarquía: borrar la marcada como
-- original dejaría al resto sin vínculo entre sí.
ALTER TABLE "ContentPiece" ADD COLUMN "translationGroupId" TEXT;

CREATE INDEX "ContentPiece_projectId_translationGroupId_idx" ON "ContentPiece"("projectId", "translationGroupId");

-- Cruce con Search Console. Tabla aparte y no columnas de ContentPiece: el
-- inventario ordena por clics/impresiones en SQL, y lo medido no se mezcla con
-- lo que una persona carga a mano. Una fila por pieza — no es serie histórica.
CREATE TABLE "ContentPieceSeoStat" (
  "id"          SERIAL NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "projectId"   INTEGER NOT NULL,
  "pieceId"     INTEGER NOT NULL,
  -- NULL = la URL de la pieza no aparece en los datos del sitio. Se guarda la
  -- fila igual, para distinguir "nunca se midió" de "se midió y no tiene nada".
  "matchedUrl"  TEXT,
  "periodStart" TEXT NOT NULL,
  "periodEnd"   TEXT NOT NULL,
  "clicks"      INTEGER NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "ctr"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "position"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- NULL (y no 0) cuando la nota no aparecía en los 28 días anteriores: una
  -- nota recién publicada no tiene que figurar como si hubiera caído.
  "prevClicks"      INTEGER,
  "prevImpressions" INTEGER,
  "prevCtr"         DOUBLE PRECISION,
  "prevPosition"    DOUBLE PRECISION,
  "topQueries" TEXT NOT NULL DEFAULT '[]',
  "alerts"     TEXT NOT NULL DEFAULT '[]',
  "fetchedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContentPieceSeoStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPieceSeoStat_pieceId_key" ON "ContentPieceSeoStat"("pieceId");
CREATE INDEX "ContentPieceSeoStat_projectId_clicks_idx" ON "ContentPieceSeoStat"("projectId", "clicks");
CREATE INDEX "ContentPieceSeoStat_workspaceId_idx" ON "ContentPieceSeoStat"("workspaceId");

ALTER TABLE "ContentPieceSeoStat" ADD CONSTRAINT "ContentPieceSeoStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPieceSeoStat" ADD CONSTRAINT "ContentPieceSeoStat_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPieceSeoStat" ADD CONSTRAINT "ContentPieceSeoStat_pieceId_fkey"
  FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
