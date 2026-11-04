-- CreateTable
CREATE TABLE "CannibalResolution" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'default',
    "action" TEXT NOT NULL DEFAULT 'otro',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'resolved',
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mainUrl" TEXT,
    "urls" TEXT NOT NULL DEFAULT '[]',
    "lastCheckedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "reopenEvidence" TEXT,
    "resolvedById" INTEGER,
    "resolvedByAgentId" INTEGER,
    "resolvedByAgentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannibalResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CannibalResolution_projectId_status_idx" ON "CannibalResolution"("projectId", "status");

-- CreateIndex
CREATE INDEX "CannibalResolution_workspaceId_idx" ON "CannibalResolution"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CannibalResolution_projectId_query_language_key" ON "CannibalResolution"("projectId", "query", "language");

-- AddForeignKey
ALTER TABLE "CannibalResolution" ADD CONSTRAINT "CannibalResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannibalResolution" ADD CONSTRAINT "CannibalResolution_resolvedByAgentId_fkey" FOREIGN KEY ("resolvedByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannibalResolution" ADD CONSTRAINT "CannibalResolution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannibalResolution" ADD CONSTRAINT "CannibalResolution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

