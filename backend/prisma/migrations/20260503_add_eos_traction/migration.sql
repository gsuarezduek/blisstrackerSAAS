-- Rocas trimestrales
CREATE TABLE "EOSRock" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "ownerId"     INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "quarter"     TEXT NOT NULL,                            -- "2026-Q2"
  "status"      TEXT NOT NULL DEFAULT 'not_started',      -- not_started | on_track | off_track | complete
  "notes"       TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EOSRock_workspaceId_idx" ON "EOSRock"("workspaceId");
CREATE INDEX "EOSRock_quarter_idx"     ON "EOSRock"("quarter");

-- To-Dos semanales (L10 meeting)
CREATE TABLE "EOSTodo" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "ownerId"     INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "week"        TEXT NOT NULL,   -- "2026-W18" ISO
  "done"        BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EOSTodo_workspaceId_week_idx" ON "EOSTodo"("workspaceId", "week");

-- Log de reunión L10
CREATE TABLE "EOSMeeting" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "week"        TEXT NOT NULL,   -- "2026-W18"
  "date"        TEXT,            -- "2026-05-06"
  "rating"      INTEGER,         -- 1-10
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EOSMeeting_workspaceId_week_key" UNIQUE ("workspaceId", "week")
);

CREATE INDEX "EOSMeeting_workspaceId_idx" ON "EOSMeeting"("workspaceId");
