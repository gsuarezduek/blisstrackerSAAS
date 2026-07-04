-- Auditoría On-Page de SEO: crawler multi-página + checks on-page + enlazado interno IA.
CREATE TABLE "OnPageAudit" (
  "id"              SERIAL       NOT NULL,
  "workspaceId"     INTEGER      NOT NULL,
  "projectId"       INTEGER      NOT NULL,
  "status"          TEXT         NOT NULL DEFAULT 'pending',
  "score"           INTEGER,
  "pagesCrawled"    INTEGER,
  "findings"        TEXT         NOT NULL DEFAULT '[]',
  "pages"           TEXT         NOT NULL DEFAULT '[]',
  "linkSuggestions" TEXT         NOT NULL DEFAULT '[]',
  "errorMsg"        TEXT,
  "tokensUsed"      INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnPageAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnPageAudit_projectId_createdAt_idx" ON "OnPageAudit"("projectId", "createdAt");
CREATE INDEX "OnPageAudit_workspaceId_idx"         ON "OnPageAudit"("workspaceId");

ALTER TABLE "OnPageAudit" ADD CONSTRAINT "OnPageAudit_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnPageAudit" ADD CONSTRAINT "OnPageAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
