-- Actualizar avatar por defecto de bee.png a 2bee.png
ALTER TABLE "User" ALTER COLUMN "avatar" SET DEFAULT '2bee.png';
UPDATE "User" SET "avatar" = '2bee.png' WHERE "avatar" = 'bee.png';
