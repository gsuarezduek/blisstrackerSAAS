-- CreateTable
CREATE TABLE "SerpSnapshot" (
  "id"               SERIAL PRIMARY KEY,
  "trackedKeywordId" INTEGER NOT NULL,
  "projectId"        INTEGER NOT NULL,
  "workspaceId"      INTEGER NOT NULL,
  "capturedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "position"         INTEGER,
  "resultUrl"        TEXT,
  "serpFeatures"     TEXT NOT NULL DEFAULT '[]',
  "competitors"      TEXT NOT NULL DEFAULT '[]',
  "peopleAlsoAsk"    TEXT NOT NULL DEFAULT '[]',
  "relatedSearches"  TEXT NOT NULL DEFAULT '[]',
  "country"          TEXT NOT NULL DEFAULT 'ar',
  "totalResults"     TEXT
);

-- AddForeignKey
ALTER TABLE "SerpSnapshot"
  ADD CONSTRAINT "SerpSnapshot_trackedKeywordId_fkey"
  FOREIGN KEY ("trackedKeywordId")
  REFERENCES "TrackedKeyword"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SerpSnapshot_trackedKeywordId_capturedAt_idx"
  ON "SerpSnapshot"("trackedKeywordId", "capturedAt");

-- CreateIndex
CREATE INDEX "SerpSnapshot_projectId_workspaceId_idx"
  ON "SerpSnapshot"("projectId", "workspaceId");
