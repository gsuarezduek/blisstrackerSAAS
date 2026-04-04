-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing admins
UPDATE "User" SET "isAdmin" = true WHERE role = 'ADMIN';
