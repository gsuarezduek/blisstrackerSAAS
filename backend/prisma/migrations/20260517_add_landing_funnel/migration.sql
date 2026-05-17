-- AlterTable: agregar flag demoSeeded a Workspace para seed data del onboarding
ALTER TABLE "Workspace"
  ADD COLUMN "demoSeeded" BOOLEAN NOT NULL DEFAULT FALSE;

-- CreateTable: ConversionEvent (analytics simple cross-funnel)
CREATE TABLE "ConversionEvent" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversionEvent_name_createdAt_idx" ON "ConversionEvent"("name", "createdAt");
CREATE INDEX "ConversionEvent_workspaceId_idx" ON "ConversionEvent"("workspaceId");
