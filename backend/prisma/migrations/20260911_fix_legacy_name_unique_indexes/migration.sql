-- Re-aplica el drop de los índices únicos legacy globales-por-nombre que la migración
-- `20260419_drop_workday_legacy_index` ya había intentado eliminar (con DROP INDEX IF
-- EXISTS, la forma correcta). Detectado en producción: "UserRole_name_key" seguía activo
-- (confirmado por un ERROR real de Postgres — duplicate key en UserRole_name_key al
-- registrar un segundo workspace con el rol default "PROJECT_MANAGER"), lo que rompía
-- CUALQUIER workspace nuevo posterior al primero que usara ese nombre de rol: el INSERT
-- fallaba dentro de la transacción de creación de workspace, quedaba abortada a nivel
-- Postgres, y el COMMIT posterior (sobre una transacción ya abortada) no tira error —
-- Postgres hace un ROLLBACK silencioso — así que la app creía que el registro había
-- salido bien (token + 201) cuando en realidad NADA se había guardado.
--
-- No hay certeza de por qué esa migración anterior no tomó efecto en producción (falló
-- silenciosamente, no se corrió, o algo recreó el índice después), así que esta re-emite
-- los 5 drops de forma idempotente — sin costo si alguno ya estaba bien.
DROP INDEX IF EXISTS "WorkDay_userId_date_key";
DROP INDEX IF EXISTS "DailyInsight_userId_date_key";
DROP INDEX IF EXISTS "Project_name_key";
DROP INDEX IF EXISTS "Service_name_key";
DROP INDEX IF EXISTS "UserRole_name_key";
