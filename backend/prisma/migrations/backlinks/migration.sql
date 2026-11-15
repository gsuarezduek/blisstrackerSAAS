-- Backlinks: gestión del perfil de enlaces en Marketing → GEO/SEO → Enlaces.
--
-- Seis tablas. Las tres decisiones de modelado que no se leen solas en el DDL:
--   · Backlink/BacklinkProspect tienen UNIQUE por (projectId, sourceUrl) y
--     (projectId, domain): es la idempotencia de la importación de CSV.
--   · BacklinkCheck y BacklinkProfileReading son append-only (sin UNIQUE): un
--     chequeo y una lectura son observaciones de un momento, no estados.
--   · BacklinkSnapshot sí es mensual (UNIQUE por projectId+month) porque
--     monthlyReport/history.js indexa las series por mes y asume una fila por mes.
--
-- Sin backfill: no hay dato previo de backlinks en el producto.

-- CreateTable
CREATE TABLE "Backlink" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "targetUrl" TEXT,
    "anchor" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'unknown',
    "placement" TEXT,
    "domainRating" DOUBLE PRECISION,
    "traffic" INTEGER,
    "language" TEXT,
    "notes" TEXT,
    "firstSeenAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatch" TEXT,
    "verifiable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'sin_verificar',
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "sourceNoindex" BOOLEAN NOT NULL DEFAULT false,
    "checkFailures" INTEGER NOT NULL DEFAULT 0,
    "lostAt" TIMESTAMP(3),
    "statusLockedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdByAgentId" INTEGER,
    "createdByAgentName" TEXT,
    "updatedById" INTEGER,
    "updatedByAgentId" INTEGER,
    "updatedByAgentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Backlink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklinkCheck" (
    "id" SERIAL NOT NULL,
    "backlinkId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "anchor" TEXT,
    "rel" TEXT,
    "linkType" TEXT,
    "targetUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "redirectedTo" TEXT,
    "errorMsg" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklinkCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklinkProspect" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "linksToCompetitors" INTEGER NOT NULL DEFAULT 0,
    "exampleUrl" TEXT,
    "exampleAnchor" TEXT,
    "domainRating" DOUBLE PRECISION,
    "traffic" INTEGER,
    "language" TEXT,
    "alreadyLinked" BOOLEAN NOT NULL DEFAULT false,
    "alreadyLinkedAt" TIMESTAMP(3),
    "verdict" TEXT NOT NULL DEFAULT 'sin_evaluar',
    "verdictSource" TEXT NOT NULL DEFAULT 'none',
    "verdictReason" TEXT,
    "verdictAt" TIMESTAMP(3),
    "verdictLockedAt" TIMESTAMP(3),
    "pipelineStatus" TEXT NOT NULL DEFAULT 'sin_empezar',
    "pipelineNote" TEXT,
    "ownerId" INTEGER,
    "cost" DOUBLE PRECISION,
    "dueDate" TEXT,
    "taskId" INTEGER,
    "backlinkId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatch" TEXT,
    "createdById" INTEGER,
    "createdByAgentId" INTEGER,
    "createdByAgentName" TEXT,
    "updatedById" INTEGER,
    "updatedByAgentId" INTEGER,
    "updatedByAgentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklinkProfileReading" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "ownLinks" INTEGER NOT NULL DEFAULT 0,
    "ownDomains" INTEGER NOT NULL DEFAULT 0,
    "ownFollowLinks" INTEGER NOT NULL DEFAULT 0,
    "ownLostLinks" INTEGER NOT NULL DEFAULT 0,
    "reportedDomains" INTEGER,
    "reportedLinks" INTEGER,
    "reportedSource" TEXT,
    "domainRating" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdById" INTEGER,
    "createdByAgentId" INTEGER,
    "createdByAgentName" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklinkProfileReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklinkSnapshot" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "referringDomains" INTEGER NOT NULL DEFAULT 0,
    "activeLinks" INTEGER NOT NULL DEFAULT 0,
    "followLinks" INTEGER NOT NULL DEFAULT 0,
    "newLinks" INTEGER NOT NULL DEFAULT 0,
    "lostLinks" INTEGER NOT NULL DEFAULT 0,
    "avgDomainRating" DOUBLE PRECISION,
    "domainRating" DOUBLE PRECISION,
    "reportedDomains" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklinkJob" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMsg" TEXT,
    "checked" INTEGER,
    "changed" INTEGER,
    "lost" INTEGER,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backlink_projectId_status_idx" ON "Backlink"("projectId", "status");

-- CreateIndex
CREATE INDEX "Backlink_projectId_sourceDomain_idx" ON "Backlink"("projectId", "sourceDomain");

-- CreateIndex
CREATE INDEX "Backlink_projectId_firstSeenAt_idx" ON "Backlink"("projectId", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Backlink_workspaceId_idx" ON "Backlink"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Backlink_projectId_sourceUrl_key" ON "Backlink"("projectId", "sourceUrl");

-- CreateIndex
CREATE INDEX "BacklinkCheck_backlinkId_createdAt_idx" ON "BacklinkCheck"("backlinkId", "createdAt");

-- CreateIndex
CREATE INDEX "BacklinkCheck_projectId_createdAt_idx" ON "BacklinkCheck"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "BacklinkProspect_projectId_verdict_idx" ON "BacklinkProspect"("projectId", "verdict");

-- CreateIndex
CREATE INDEX "BacklinkProspect_projectId_pipelineStatus_idx" ON "BacklinkProspect"("projectId", "pipelineStatus");

-- CreateIndex
CREATE INDEX "BacklinkProspect_projectId_alreadyLinked_idx" ON "BacklinkProspect"("projectId", "alreadyLinked");

-- CreateIndex
CREATE INDEX "BacklinkProspect_workspaceId_idx" ON "BacklinkProspect"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BacklinkProspect_projectId_domain_key" ON "BacklinkProspect"("projectId", "domain");

-- CreateIndex
CREATE INDEX "BacklinkProfileReading_projectId_capturedAt_idx" ON "BacklinkProfileReading"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "BacklinkProfileReading_workspaceId_idx" ON "BacklinkProfileReading"("workspaceId");

-- CreateIndex
CREATE INDEX "BacklinkSnapshot_workspaceId_idx" ON "BacklinkSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BacklinkSnapshot_projectId_month_key" ON "BacklinkSnapshot"("projectId", "month");

-- CreateIndex
CREATE INDEX "BacklinkJob_projectId_kind_createdAt_idx" ON "BacklinkJob"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "BacklinkJob_workspaceId_idx" ON "BacklinkJob"("workspaceId");

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backlink" ADD CONSTRAINT "Backlink_updatedByAgentId_fkey" FOREIGN KEY ("updatedByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkCheck" ADD CONSTRAINT "BacklinkCheck_backlinkId_fkey" FOREIGN KEY ("backlinkId") REFERENCES "Backlink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_backlinkId_fkey" FOREIGN KEY ("backlinkId") REFERENCES "Backlink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProspect" ADD CONSTRAINT "BacklinkProspect_updatedByAgentId_fkey" FOREIGN KEY ("updatedByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProfileReading" ADD CONSTRAINT "BacklinkProfileReading_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProfileReading" ADD CONSTRAINT "BacklinkProfileReading_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProfileReading" ADD CONSTRAINT "BacklinkProfileReading_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkProfileReading" ADD CONSTRAINT "BacklinkProfileReading_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkSnapshot" ADD CONSTRAINT "BacklinkSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkSnapshot" ADD CONSTRAINT "BacklinkSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkJob" ADD CONSTRAINT "BacklinkJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkJob" ADD CONSTRAINT "BacklinkJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

