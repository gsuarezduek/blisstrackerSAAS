-- Content Gap: compara la página propia vs. competidores del SERP (crawl + IA).
CREATE TABLE "ContentGap" (
  "id"                SERIAL       NOT NULL,
  "workspaceId"       INTEGER      NOT NULL,
  "projectId"         INTEGER      NOT NULL,
  "keyword"           TEXT         NOT NULL,
  "status"            TEXT         NOT NULL DEFAULT 'pending',
  "ownUrl"            TEXT,
  "ownPosition"       INTEGER,
  "competitors"       TEXT         NOT NULL DEFAULT '[]',
  "gaps"              TEXT         NOT NULL DEFAULT '[]',
  "headingsSuggested" TEXT         NOT NULL DEFAULT '[]',
  "summary"           TEXT,
  "errorMsg"          TEXT,
  "tokensUsed"        INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentGap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentGap_projectId_createdAt_idx" ON "ContentGap"("projectId", "createdAt");
CREATE INDEX "ContentGap_workspaceId_idx"         ON "ContentGap"("workspaceId");

ALTER TABLE "ContentGap" ADD CONSTRAINT "ContentGap_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentGap" ADD CONSTRAINT "ContentGap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
