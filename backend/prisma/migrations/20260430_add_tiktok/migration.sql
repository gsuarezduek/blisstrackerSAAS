-- CreateTable: TikTokSnapshot
CREATE TABLE "TikTokSnapshot" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"          TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL DEFAULT 0,
  "videoCount"     INTEGER,
  "likesCount"     DOUBLE PRECISION,
  "avgViews"       DOUBLE PRECISION,
  "avgLikes"       DOUBLE PRECISION,
  "avgComments"    DOUBLE PRECISION,
  "avgShares"      DOUBLE PRECISION,
  "postsThisMonth" INTEGER,
  "engagementRate" DOUBLE PRECISION,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TikTokSnapshot_projectId_month_key" UNIQUE ("projectId", "month")
);
CREATE INDEX "TikTokSnapshot_workspaceId_idx" ON "TikTokSnapshot"("workspaceId");

-- CreateTable: TikTokFollowerLog
CREATE TABLE "TikTokFollowerLog" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "date"           TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TikTokFollowerLog_projectId_date_key" UNIQUE ("projectId", "date")
);
CREATE INDEX "TikTokFollowerLog_workspaceId_idx" ON "TikTokFollowerLog"("workspaceId");
