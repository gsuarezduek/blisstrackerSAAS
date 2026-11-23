-- Salud de la credencial de un agente: detectar que quedó con el token viejo.
--
-- `rotatedAt` + `lastUsedAt` responden "¿se volvió a conectar después de que roté?".
-- `prevTokenPrefix` son los primeros 12 caracteres del sha256 del token ANTERIOR (nunca
-- el token): es el mismo prefijo que guarda McpAuthFailure.hashPrefix, así que permite
-- atribuirle a este agente los rechazos del valor viejo. Sin esto esos rechazos llegan
-- anónimos ('unknown_token': el hash ya no coincide con ninguna fila) y el agente se ve
-- sano en el roster mientras falla cada request.
ALTER TABLE "McpToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "McpToken" ADD COLUMN "prevTokenPrefix" TEXT;
