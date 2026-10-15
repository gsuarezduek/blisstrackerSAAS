-- CreateTable
CREATE TABLE "MarketingRefreshJob" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'running',
    "results" TEXT NOT NULL DEFAULT '[]',
    "errorMsg" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "requestedByUserId" INTEGER,

    CONSTRAINT "MarketingRefreshJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingRefreshJob_workspaceId_idx" ON "MarketingRefreshJob"("workspaceId");

-- AddForeignKey
ALTER TABLE "MarketingRefreshJob" ADD CONSTRAINT "MarketingRefreshJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingRefreshJob" ADD CONSTRAINT "MarketingRefreshJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
