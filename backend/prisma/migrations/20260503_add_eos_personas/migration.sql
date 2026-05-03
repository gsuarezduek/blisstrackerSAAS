-- Analizador de Personas (ratings por valor medular + GWC)
CREATE TABLE "PeopleAnalyzerRating" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "userId"      INTEGER NOT NULL REFERENCES "User"("id")      ON DELETE CASCADE,
  "valueKey"    TEXT    NOT NULL,  -- texto del valor medular, o 'gwc_get'/'gwc_want'/'gwc_capacity'
  "rating"      TEXT    NOT NULL,  -- '+' | '+/-' | '-'
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeopleAnalyzerRating_wk_uk" UNIQUE ("workspaceId", "userId", "valueKey")
);
CREATE INDEX "PeopleAnalyzerRating_workspaceId_idx" ON "PeopleAnalyzerRating"("workspaceId");
CREATE INDEX "PeopleAnalyzerRating_userId_idx"      ON "PeopleAnalyzerRating"("userId");

-- Regla de las 3 Faltas
CREATE TABLE "EOSStrike" (
  "id"           SERIAL PRIMARY KEY,
  "workspaceId"  INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "userId"       INTEGER NOT NULL REFERENCES "User"("id")      ON DELETE CASCADE,
  "strikeNumber" INTEGER NOT NULL,  -- 1, 2 o 3 (asignado automáticamente)
  "reason"       TEXT    NOT NULL,
  "createdById"  INTEGER NOT NULL REFERENCES "User"("id"),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EOSStrike_workspaceId_idx" ON "EOSStrike"("workspaceId");
CREATE INDEX "EOSStrike_userId_idx"      ON "EOSStrike"("userId");

-- Organigrama de Rendición de Cuentas
CREATE TABLE "AccountabilityNode" (
  "id"               SERIAL PRIMARY KEY,
  "workspaceId"      INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "parentId"         INTEGER REFERENCES "AccountabilityNode"("id") ON DELETE SET NULL,
  "seat"             TEXT    NOT NULL,
  "userId"           INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "accountabilities" TEXT    NOT NULL DEFAULT '[]',  -- JSON: string[]
  "order"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccountabilityNode_workspaceId_idx" ON "AccountabilityNode"("workspaceId");
CREATE INDEX "AccountabilityNode_parentId_idx"    ON "AccountabilityNode"("parentId");
