-- Revoca los JWT ya emitidos cuando cambia la contraseña.
-- El middleware compara el `iat` del token contra este instante.
ALTER TABLE "User" ADD COLUMN "sessionValidAfter" TIMESTAMP(3);
