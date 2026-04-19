-- La migración add_saas_multitenancy usó DROP CONSTRAINT IF EXISTS para borrar índices
-- creados con CREATE UNIQUE INDEX (no con ADD CONSTRAINT). En PostgreSQL, DROP CONSTRAINT
-- no elimina índices standalone, por lo que sobrevivieron silenciosamente.
-- Estos índices legacy conflictúan cuando un usuario tiene datos en más de un workspace
-- el mismo día (WorkDay, DailyInsight) o cuando el mismo nombre existe en distintos
-- workspaces (Project, Service, UserRole).

-- WorkDay: unicidad ahora es (userId, workspaceId, date), no (userId, date)
DROP INDEX IF EXISTS "WorkDay_userId_date_key";

-- DailyInsight: mismo problema — unicidad ahora es (userId, workspaceId, date)
DROP INDEX IF EXISTS "DailyInsight_userId_date_key";

-- Project, Service, UserRole: unicidad del nombre ahora es por workspace, no global
DROP INDEX IF EXISTS "Project_name_key";
DROP INDEX IF EXISTS "Service_name_key";
DROP INDEX IF EXISTS "UserRole_name_key";
