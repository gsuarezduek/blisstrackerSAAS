-- CreateTable: TrackedKeyword
CREATE TABLE "TrackedKeyword" (
    "id"                SERIAL NOT NULL,
    "projectId"         INTEGER NOT NULL,
    "workspaceId"       INTEGER NOT NULL,
    "query"             TEXT NOT NULL,
    "analysisContent"   TEXT,
    "analysisUpdatedAt" TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable: KeywordRanking
CREATE TABLE "KeywordRanking" (
    "id"               SERIAL NOT NULL,
    "trackedKeywordId" INTEGER NOT NULL,
    "projectId"        INTEGER NOT NULL,
    "workspaceId"      INTEGER NOT NULL,
    "month"            TEXT NOT NULL,
    "clicks"           INTEGER NOT NULL DEFAULT 0,
    "impressions"      INTEGER NOT NULL DEFAULT 0,
    "ctr"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedKeyword_projectId_query_key" ON "TrackedKeyword"("projectId", "query");
CREATE INDEX "TrackedKeyword_projectId_workspaceId_idx" ON "TrackedKeyword"("projectId", "workspaceId");

CREATE UNIQUE INDEX "KeywordRanking_trackedKeywordId_month_key" ON "KeywordRanking"("trackedKeywordId", "month");
CREATE INDEX "KeywordRanking_projectId_workspaceId_idx" ON "KeywordRanking"("projectId", "workspaceId");

-- AddForeignKey
ALTER TABLE "TrackedKeyword" ADD CONSTRAINT "TrackedKeyword_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackedKeyword" ADD CONSTRAINT "TrackedKeyword_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeywordRanking" ADD CONSTRAINT "KeywordRanking_trackedKeywordId_fkey"
    FOREIGN KEY ("trackedKeywordId") REFERENCES "TrackedKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeywordRanking" ADD CONSTRAINT "KeywordRanking_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KeywordRanking" ADD CONSTRAINT "KeywordRanking_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
