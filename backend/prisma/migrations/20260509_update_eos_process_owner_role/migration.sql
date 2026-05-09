-- AlterTable EOSProcess: reemplazar ownerId (FK a User) por ownerRole (String — nombre del rol)
ALTER TABLE "EOSProcess" DROP CONSTRAINT IF EXISTS "EOSProcess_ownerId_fkey";
ALTER TABLE "EOSProcess" DROP COLUMN IF EXISTS "ownerId";
ALTER TABLE "EOSProcess" ADD COLUMN "ownerRole" TEXT;
