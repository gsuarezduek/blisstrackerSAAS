-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "lateNotifyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN     "lateNotifyThreshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Workspace" ADD COLUMN     "lateNotifyTemplate" TEXT;
