-- Fix: índice residual de nombre único global en Project.
-- La migración de multitenancy agregó @@unique([workspaceId, name]) pero
-- el índice original Project_name_key nunca se eliminó, causando que
-- dos proyectos de distintos workspaces no pudieran tener el mismo nombre.
DROP INDEX IF EXISTS "Project_name_key";
