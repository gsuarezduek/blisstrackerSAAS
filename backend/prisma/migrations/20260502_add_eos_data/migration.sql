-- CreateTable
CREATE TABLE "EOSData" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "coreValues"  TEXT NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EOSData_workspaceId_key" UNIQUE ("workspaceId")
);

CREATE INDEX "EOSData_workspaceId_idx" ON "EOSData"("workspaceId");
