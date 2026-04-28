-- CreateTable: InstagramFollowerLog — registro diario de seguidores
CREATE TABLE "InstagramFollowerLog" (
    "id"             SERIAL,
    "projectId"      INTEGER NOT NULL,
    "workspaceId"    INTEGER NOT NULL,
    "date"           TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstagramFollowerLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InstagramFollowerLog" ADD CONSTRAINT "InstagramFollowerLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstagramFollowerLog" ADD CONSTRAINT "InstagramFollowerLog_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "InstagramFollowerLog_projectId_date_key"
    ON "InstagramFollowerLog"("projectId", "date");

CREATE INDEX "InstagramFollowerLog_workspaceId_idx"
    ON "InstagramFollowerLog"("workspaceId");
