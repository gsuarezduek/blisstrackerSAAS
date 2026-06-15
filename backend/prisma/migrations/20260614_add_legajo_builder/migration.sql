-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "legajoEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN     "legajoFields" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "legajoData" JSONB NOT NULL DEFAULT '{}';
