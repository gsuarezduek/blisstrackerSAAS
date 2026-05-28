-- CreateTable
CREATE TABLE "CompetitorAccount" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "profilePicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetitorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
    "id" SERIAL NOT NULL,
    "competitorId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "mediaCount" INTEGER,
    "postsCount" INTEGER,
    "avgLikes" DOUBLE PRECISION,
    "avgComments" DOUBLE PRECISION,
    "engagementRate" DOUBLE PRECISION,
    "topPosts" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorFollowerLog" (
    "id" SERIAL NOT NULL,
    "competitorId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorFollowerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorAccount_projectId_platform_username_key" ON "CompetitorAccount"("projectId", "platform", "username");
CREATE INDEX "CompetitorAccount_workspaceId_idx" ON "CompetitorAccount"("workspaceId");
CREATE INDEX "CompetitorAccount_projectId_idx" ON "CompetitorAccount"("projectId");

CREATE UNIQUE INDEX "CompetitorSnapshot_competitorId_month_key" ON "CompetitorSnapshot"("competitorId", "month");
CREATE INDEX "CompetitorSnapshot_workspaceId_idx" ON "CompetitorSnapshot"("workspaceId");
CREATE INDEX "CompetitorSnapshot_competitorId_idx" ON "CompetitorSnapshot"("competitorId");

CREATE UNIQUE INDEX "CompetitorFollowerLog_competitorId_date_key" ON "CompetitorFollowerLog"("competitorId", "date");
CREATE INDEX "CompetitorFollowerLog_workspaceId_idx" ON "CompetitorFollowerLog"("workspaceId");
CREATE INDEX "CompetitorFollowerLog_competitorId_idx" ON "CompetitorFollowerLog"("competitorId");

-- AddForeignKey
ALTER TABLE "CompetitorAccount" ADD CONSTRAINT "CompetitorAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "CompetitorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitorFollowerLog" ADD CONSTRAINT "CompetitorFollowerLog_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "CompetitorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
