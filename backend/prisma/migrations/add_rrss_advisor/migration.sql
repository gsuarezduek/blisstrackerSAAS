-- RRSS Advisor (IA): diagnóstico de Instagram/TikTok/LinkedIn/Facebook/YouTube,
-- cacheado análogo a AdsAdvisorResult, + toggle de auto-análisis semanal.
CREATE TABLE "RrssAdvisorResult" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "diagnostico" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RrssAdvisorResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RrssAdvisorResult_projectId_platform_key" ON "RrssAdvisorResult"("projectId", "platform");
CREATE INDEX "RrssAdvisorResult_workspaceId_idx" ON "RrssAdvisorResult"("workspaceId");

ALTER TABLE "RrssAdvisorResult" ADD CONSTRAINT "RrssAdvisorResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RrssAdvisorResult" ADD CONSTRAINT "RrssAdvisorResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workspace" ADD COLUMN "rrssAdvisorAutoEnabled" BOOLEAN NOT NULL DEFAULT true;
