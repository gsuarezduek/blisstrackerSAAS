-- Archivado manual de leads (sacarlos del Pipeline/lista principal sin borrarlos).
ALTER TABLE "Lead" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Lead_workspaceId_archived_idx" ON "Lead"("workspaceId", "archived");
