-- CreateTable: LinkedinSnapshot
CREATE TABLE "LinkedinSnapshot" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"          TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL DEFAULT 0,
  "pageViews"      INTEGER,
  "uniqueVisitors" INTEGER,
  "impressions"    INTEGER,
  "clicks"         INTEGER,
  "ctr"            DOUBLE PRECISION,
  "engagementRate" DOUBLE PRECISION,
  "totalLikes"     INTEGER,
  "totalComments"  INTEGER,
  "totalShares"    INTEGER,
  "postsThisMonth" INTEGER,
  "topPosts"       TEXT NOT NULL DEFAULT '[]',
  "demographics"   TEXT NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LinkedinSnapshot_projectId_month_key" UNIQUE ("projectId", "month")
);
CREATE INDEX "LinkedinSnapshot_workspaceId_idx" ON "LinkedinSnapshot"("workspaceId");

-- CreateTable: LinkedinFollowerLog
CREATE TABLE "LinkedinFollowerLog" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "date"           TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LinkedinFollowerLog_projectId_date_key" UNIQUE ("projectId", "date")
);
CREATE INDEX "LinkedinFollowerLog_workspaceId_idx" ON "LinkedinFollowerLog"("workspaceId");
