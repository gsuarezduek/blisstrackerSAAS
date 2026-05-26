-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "hoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "monthlyHours" INTEGER;
