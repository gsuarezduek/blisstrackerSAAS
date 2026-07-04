-- Content Brief de SEO generado por IA para una keyword objetivo (SERP + briefs seo_sem/marca).
CREATE TABLE "ContentBrief" (
  "id"          SERIAL       NOT NULL,
  "projectId"   INTEGER      NOT NULL,
  "workspaceId" INTEGER      NOT NULL,
  "keyword"     TEXT         NOT NULL,
  "content"     TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentBrief_projectId_keyword_key" ON "ContentBrief"("projectId", "keyword");
CREATE INDEX "ContentBrief_projectId_createdAt_idx"      ON "ContentBrief"("projectId", "createdAt");
CREATE INDEX "ContentBrief_workspaceId_idx"              ON "ContentBrief"("workspaceId");

ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
