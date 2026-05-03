-- EOS Procesos: documentación de procesos centrales del negocio

CREATE TABLE "EOSProcess" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "ownerId"     INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "status"      TEXT NOT NULL DEFAULT 'not_started',  -- 'not_started' | 'documented' | 'followed'
  "description" TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EOSProcess_workspaceId_idx" ON "EOSProcess"("workspaceId");

CREATE TABLE "EOSProcessStep" (
  "id"          SERIAL PRIMARY KEY,
  "processId"   INTEGER NOT NULL REFERENCES "EOSProcess"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EOSProcessStep_processId_idx"   ON "EOSProcessStep"("processId");
CREATE INDEX "EOSProcessStep_workspaceId_idx" ON "EOSProcessStep"("workspaceId");
