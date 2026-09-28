-- Nota mensual del Scorecard EOS: un texto colaborativo por mes calendario
-- (no por métrica), editado con el mismo motor en tiempo real (Yjs/Hocuspocus)
-- que ProjectMeeting/Lead/EOSMeeting — ver backend/src/lib/collab/.
CREATE TABLE "EOSScorecardNote" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "period"      TEXT NOT NULL,   -- "YYYY-MM"
  "notes"       TEXT,
  "notesYdoc"   BYTEA,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EOSScorecardNote_workspaceId_period_key" UNIQUE ("workspaceId", "period")
);

CREATE INDEX "EOSScorecardNote_workspaceId_idx" ON "EOSScorecardNote"("workspaceId");
