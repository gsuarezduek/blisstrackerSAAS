-- CreateTable: FacebookSnapshot
CREATE TABLE "FacebookSnapshot" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "month"          TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL DEFAULT 0,
  "fanCount"       INTEGER,
  "reach"          INTEGER,
  "impressions"    INTEGER,
  "pageViews"      INTEGER,
  "engagementRate" DOUBLE PRECISION,
  "totalLikes"     INTEGER,
  "totalComments"  INTEGER,
  "totalShares"    INTEGER,
  "postsThisMonth" INTEGER,
  "topPosts"       TEXT NOT NULL DEFAULT '[]',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacebookSnapshot_projectId_month_key" UNIQUE ("projectId", "month")
);
CREATE INDEX "FacebookSnapshot_workspaceId_idx" ON "FacebookSnapshot"("workspaceId");

-- CreateTable: FacebookFollowerLog
CREATE TABLE "FacebookFollowerLog" (
  "id"             SERIAL PRIMARY KEY,
  "projectId"      INTEGER NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "workspaceId"    INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "date"           TEXT NOT NULL,
  "followersCount" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacebookFollowerLog_projectId_date_key" UNIQUE ("projectId", "date")
);
CREATE INDEX "FacebookFollowerLog_workspaceId_idx" ON "FacebookFollowerLog"("workspaceId");
