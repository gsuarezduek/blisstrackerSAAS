-- CreateTable
CREATE TABLE "ApifyToken" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastErrorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApifyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApifyUsageLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER,
    "projectId" INTEGER,
    "platform" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tokenId" INTEGER,
    "tokenLabel" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "itemCount" INTEGER,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApifyUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApifyToken_order_idx" ON "ApifyToken"("order");
CREATE INDEX "ApifyToken_active_idx" ON "ApifyToken"("active");

-- CreateIndex
CREATE INDEX "ApifyUsageLog_createdAt_idx" ON "ApifyUsageLog"("createdAt");
CREATE INDEX "ApifyUsageLog_workspaceId_idx" ON "ApifyUsageLog"("workspaceId");
CREATE INDEX "ApifyUsageLog_workspaceId_createdAt_idx" ON "ApifyUsageLog"("workspaceId", "createdAt");
CREATE INDEX "ApifyUsageLog_workspaceId_projectId_idx" ON "ApifyUsageLog"("workspaceId", "projectId");
CREATE INDEX "ApifyUsageLog_tokenId_idx" ON "ApifyUsageLog"("tokenId");

-- AddForeignKey
ALTER TABLE "ApifyUsageLog" ADD CONSTRAINT "ApifyUsageLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");

-- AddForeignKey
ALTER TABLE "ApifyUsageLog" ADD CONSTRAINT "ApifyUsageLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id");

-- AddForeignKey
ALTER TABLE "ApifyUsageLog" ADD CONSTRAINT "ApifyUsageLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApifyToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
