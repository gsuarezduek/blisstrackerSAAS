-- AlterTable: add country column to ProjectIntegration
ALTER TABLE "ProjectIntegration" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'arg';
