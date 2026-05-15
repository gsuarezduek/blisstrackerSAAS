-- AlterTable: límite mensual de tokens de IA por workspace
ALTER TABLE "Workspace" ADD COLUMN "monthlyTokenLimit" INTEGER NOT NULL DEFAULT 1000000;
