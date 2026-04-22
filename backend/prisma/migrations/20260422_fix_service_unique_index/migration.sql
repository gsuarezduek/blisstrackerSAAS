-- Fix: la migración de multitenancy usó DROP CONSTRAINT pero el índice original
-- fue creado con CREATE UNIQUE INDEX, por lo que nunca se eliminó.
-- Esto causaba que el nombre del servicio fuera único globalmente en lugar de por workspace.
DROP INDEX IF EXISTS "Service_name_key";
