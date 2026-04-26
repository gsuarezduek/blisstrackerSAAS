-- CreateTable: InstagramSnapshot
CREATE TABLE "InstagramSnapshot" (
    "id"             SERIAL,
    "projectId"      INTEGER NOT NULL,
    "workspaceId"    INTEGER NOT NULL,
    "month"          TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "mediaCount"     INTEGER,
    "avgLikes"       DOUBLE PRECISION,
    "avgComments"    DOUBLE PRECISION,
    "engagementRate" DOUBLE PRECISION,
    "postsCount"     INTEGER,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstagramSnapshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InstagramSnapshot" ADD CONSTRAINT "InstagramSnapshot_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstagramSnapshot" ADD CONSTRAINT "InstagramSnapshot_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "InstagramSnapshot_projectId_month_key"
    ON "InstagramSnapshot"("projectId", "month");

CREATE INDEX "InstagramSnapshot_workspaceId_idx"
    ON "InstagramSnapshot"("workspaceId");
