ALTER TABLE "Project" ADD COLUMN "websiteUrl" TEXT;

CREATE TABLE "GeoAudit" (
  "id"              SERIAL        PRIMARY KEY,
  "workspaceId"     INTEGER       NOT NULL,
  "projectId"       INTEGER       NOT NULL,
  "url"             TEXT          NOT NULL,
  "status"          TEXT          NOT NULL DEFAULT 'pending',
  "score"           INTEGER,
  "citability"      INTEGER,
  "brandAuthority"  INTEGER,
  "eeat"            INTEGER,
  "technical"       INTEGER,
  "schema"          INTEGER,
  "platforms"       INTEGER,
  "findings"        TEXT          NOT NULL DEFAULT '[]',
  "recommendations" TEXT          NOT NULL DEFAULT '[]',
  "rawData"         TEXT,
  "errorMsg"        TEXT,
  "tokensUsed"      INTEGER,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeoAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GeoAudit_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GeoAudit_workspaceId_idx" ON "GeoAudit"("workspaceId");
CREATE INDEX "GeoAudit_projectId_idx"   ON "GeoAudit"("projectId");
