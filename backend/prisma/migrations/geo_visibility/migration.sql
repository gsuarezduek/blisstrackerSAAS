-- Visibilidad IA (#1/#5): catálogos (Prompt/Competitor) + corridas async
-- (Run/Result), mismo patrón status/errorMsg que GeoAudit/OnPageAudit.

CREATE TABLE "GeoVisibilityPrompt" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoVisibilityPrompt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeoVisibilityCompetitor" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoVisibilityCompetitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeoVisibilityRun" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMsg" TEXT,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoVisibilityRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeoVisibilityResult" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "promptId" INTEGER NOT NULL,
    "ownMentioned" BOOLEAN NOT NULL DEFAULT false,
    "ownPosition" INTEGER,
    "competitorsMentioned" TEXT NOT NULL DEFAULT '[]',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "rawAnswerExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoVisibilityResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeoVisibilityPrompt_workspaceId_idx" ON "GeoVisibilityPrompt"("workspaceId");
CREATE INDEX "GeoVisibilityPrompt_projectId_idx" ON "GeoVisibilityPrompt"("projectId");

CREATE INDEX "GeoVisibilityCompetitor_workspaceId_idx" ON "GeoVisibilityCompetitor"("workspaceId");
CREATE INDEX "GeoVisibilityCompetitor_projectId_idx" ON "GeoVisibilityCompetitor"("projectId");

CREATE INDEX "GeoVisibilityRun_workspaceId_idx" ON "GeoVisibilityRun"("workspaceId");
CREATE INDEX "GeoVisibilityRun_projectId_createdAt_idx" ON "GeoVisibilityRun"("projectId", "createdAt");

CREATE INDEX "GeoVisibilityResult_runId_idx" ON "GeoVisibilityResult"("runId");
CREATE INDEX "GeoVisibilityResult_promptId_idx" ON "GeoVisibilityResult"("promptId");

ALTER TABLE "GeoVisibilityPrompt" ADD CONSTRAINT "GeoVisibilityPrompt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoVisibilityPrompt" ADD CONSTRAINT "GeoVisibilityPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeoVisibilityCompetitor" ADD CONSTRAINT "GeoVisibilityCompetitor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoVisibilityCompetitor" ADD CONSTRAINT "GeoVisibilityCompetitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeoVisibilityRun" ADD CONSTRAINT "GeoVisibilityRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoVisibilityRun" ADD CONSTRAINT "GeoVisibilityRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeoVisibilityResult" ADD CONSTRAINT "GeoVisibilityResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GeoVisibilityRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeoVisibilityResult" ADD CONSTRAINT "GeoVisibilityResult_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "GeoVisibilityPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
