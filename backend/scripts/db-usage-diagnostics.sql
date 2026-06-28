-- Diagnóstico de uso de Postgres (Railway)
-- Ejecutar con: psql "$DATABASE_URL" -f scripts/db-usage-diagnostics.sql
-- O pegar query por query en Railway → Postgres → Data / Query.

-- 1) Tamaño total de cada tabla (datos + índices + TOAST de blobs)
--    El TOAST es donde Postgres guarda los Bytes (imágenes). Ojo a esa columna.
SELECT
  c.relname                                            AS tabla,
  pg_size_pretty(pg_total_relation_size(c.oid))        AS total,
  pg_size_pretty(pg_relation_size(c.oid))              AS solo_datos,
  pg_size_pretty(pg_indexes_size(c.oid))               AS indices,
  pg_size_pretty(
    COALESCE(pg_total_relation_size(c.reltoastrelid), 0)
  )                                                    AS toast_blobs,
  c.reltuples::bigint                                  AS filas_aprox
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 30;

-- 2) Cuántas imágenes hay guardadas como bytes y cuánto pesan
SELECT 'SocialImage' AS tabla, COUNT(*) AS filas,
       pg_size_pretty(COALESCE(SUM(octet_length("imageData")),0)) AS peso_bytes
FROM "SocialImage"
UNION ALL
SELECT 'Avatar', COUNT(*), pg_size_pretty(COALESCE(SUM(octet_length("imageData")),0))
FROM "Avatar"
UNION ALL
SELECT 'Workspace.logo', COUNT("logoData"), pg_size_pretty(COALESCE(SUM(octet_length("logoData")),0))
FROM "Workspace"
UNION ALL
SELECT 'Workspace.banner', COUNT("bannerData"), pg_size_pretty(COALESCE(SUM(octet_length("bannerData")),0))
FROM "Workspace"
UNION ALL
SELECT 'MonthlyReport.banner', COUNT("bannerData"), pg_size_pretty(COALESCE(SUM(octet_length("bannerData")),0))
FROM "MonthlyReport"
UNION ALL
SELECT 'Game.image', COUNT("imageData"), pg_size_pretty(COALESCE(SUM(octet_length("imageData")),0))
FROM "Game";

-- 3) Crecimiento de SocialImage por día (¿cuándo se disparó?)
SELECT DATE("createdAt") AS dia,
       COUNT(*)          AS imagenes,
       pg_size_pretty(SUM(octet_length("imageData"))) AS peso
FROM "SocialImage"
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;

-- 4) Tuplas muertas / necesidad de VACUUM (bloat por updates de blobs)
SELECT relname AS tabla, n_live_tup AS vivas, n_dead_tup AS muertas,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- 5) (Si pg_stat_statements está habilitado en Railway) las queries que más
--    bytes mueven. Si da error, esta extensión no está activa — ignorá.
SELECT
  LEFT(query, 90)                                  AS query,
  calls,
  pg_size_pretty(shared_blks_read * 8192)          AS leido_de_disco,
  ROUND(total_exec_time::numeric, 0)               AS ms_total
FROM pg_stat_statements
ORDER BY shared_blks_read DESC
LIMIT 20;
