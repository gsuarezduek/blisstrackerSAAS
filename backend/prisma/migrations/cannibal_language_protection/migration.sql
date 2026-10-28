-- Canibalización SEO: recomendaciones no destructivas (URLs protegidas por
-- proyecto) + separación por idioma/hreflang + detección de URLs indexadas
-- por error. Todas las columnas nuevas son opcionales / con default, no
-- rompe reportes existentes (quedan con languageFilter='all' y las listas
-- nuevas vacías).

ALTER TABLE "Project" ADD COLUMN "cannibalProtectedUrls" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "CannibalReport" ADD COLUMN "languageFilter" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "CannibalReport" ADD COLUMN "hreflangIssues" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CannibalReport" ADD COLUMN "indexedByMistake" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CannibalReport" ADD COLUMN "hreflangCount" INTEGER;
ALTER TABLE "CannibalReport" ADD COLUMN "indexedByMistakeCount" INTEGER;
