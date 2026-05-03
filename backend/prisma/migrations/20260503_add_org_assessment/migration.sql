CREATE TABLE "OrgAssessmentRound" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "status"      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  "resultData"  TEXT,                          -- JSON: { scores, categoryAverages, totalAverage, analysis, respondentCount }
  "closedAt"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrgAssessmentResponse" (
  "id"          SERIAL PRIMARY KEY,
  "roundId"     INTEGER NOT NULL REFERENCES "OrgAssessmentRound"("id") ON DELETE CASCADE,
  "workspaceId" INTEGER NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "userId"      INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "answers"     TEXT NOT NULL DEFAULT '[]',    -- JSON: [{questionId, score (1-5)}]
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgAssessmentResponse_roundId_userId_key" UNIQUE ("roundId", "userId")
);

CREATE INDEX "OrgAssessmentRound_workspaceId_idx"    ON "OrgAssessmentRound"("workspaceId");
CREATE INDEX "OrgAssessmentResponse_roundId_idx"     ON "OrgAssessmentResponse"("roundId");
CREATE INDEX "OrgAssessmentResponse_workspaceId_idx" ON "OrgAssessmentResponse"("workspaceId");
CREATE INDEX "OrgAssessmentResponse_userId_idx"      ON "OrgAssessmentResponse"("userId");
