-- CreateTable: YouTubeSnapshot
CREATE TABLE "YouTubeSnapshot" (
  "id"              SERIAL PRIMARY KEY,
  "projectId"       INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"     INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"           TEXT NOT NULL,
  "subscriberCount" INTEGER NOT NULL DEFAULT 0,
  "videoCount"      INTEGER,
  "viewCountTotal"  DOUBLE PRECISION,
  "monthViews"      DOUBLE PRECISION,
  "videosThisMonth" INTEGER,
  "longsThisMonth"  INTEGER,
  "shortsThisMonth" INTEGER,
  "avgViews"        DOUBLE PRECISION,
  "avgLikes"        DOUBLE PRECISION,
  "avgComments"     DOUBLE PRECISION,
  "engagementRate"  DOUBLE PRECISION,
  "topVideos"       TEXT NOT NULL DEFAULT '[]',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YouTubeSnapshot_projectId_month_key" UNIQUE ("projectId", "month")
);
CREATE INDEX "YouTubeSnapshot_workspaceId_idx" ON "YouTubeSnapshot"("workspaceId");

-- CreateTable: YouTubeFollowerLog
CREATE TABLE "YouTubeFollowerLog" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "date"           TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YouTubeFollowerLog_projectId_date_key" UNIQUE ("projectId", "date")
);
CREATE INDEX "YouTubeFollowerLog_workspaceId_idx" ON "YouTubeFollowerLog"("workspaceId");
