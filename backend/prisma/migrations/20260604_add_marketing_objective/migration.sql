-- CreateTable
CREATE TABLE "MarketingObjective" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "periodicity" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "platform" TEXT,
    "trackedKeywordId" INTEGER,
    "competitorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingObjective_projectId_idx" ON "MarketingObjective"("projectId");
CREATE INDEX "MarketingObjective_workspaceId_idx" ON "MarketingObjective"("workspaceId");

-- AddForeignKey
ALTER TABLE "MarketingObjective" ADD CONSTRAINT "MarketingObjective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingObjective" ADD CONSTRAINT "MarketingObjective_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingObjective" ADD CONSTRAINT "MarketingObjective_trackedKeywordId_fkey" FOREIGN KEY ("trackedKeywordId") REFERENCES "TrackedKeyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingObjective" ADD CONSTRAINT "MarketingObjective_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "CompetitorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
