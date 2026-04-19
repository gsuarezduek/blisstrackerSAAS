-- La migración add_saas_multitenancy usó DROP CONSTRAINT IF EXISTS para borrar el índice
-- "WorkDay_userId_date_key", pero ese índice fue creado con CREATE UNIQUE INDEX (no con
-- ADD CONSTRAINT), por lo que DROP CONSTRAINT no lo eliminó silenciosamente.
-- El índice viejo (userId, date) sigue existiendo en producción y conflictúa al intentar
-- crear WorkDays para el mismo usuario en distintos workspaces el mismo día.
DROP INDEX IF EXISTS "WorkDay_userId_date_key";
