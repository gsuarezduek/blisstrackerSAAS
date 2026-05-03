CREATE TABLE "EOSIssue" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "ownerId"     INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "type"        TEXT NOT NULL DEFAULT 'weekly',
  "status"      TEXT NOT NULL DEFAULT 'open',
  "priority"    TEXT NOT NULL DEFAULT 'medium',
  "notes"       TEXT,
  "solvedAt"    TIMESTAMP(3),
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EOSIssue_workspaceId_idx" ON "EOSIssue"("workspaceId");
CREATE INDEX "EOSIssue_type_status_idx" ON "EOSIssue"("type", "status");
