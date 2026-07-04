-- Feedback del cliente sobre el informe (desde el link público, sin auth): 1–5 estrellas + comentario.
CREATE TABLE "ReportFeedback" (
  "id"          SERIAL       NOT NULL,
  "reportId"    INTEGER      NOT NULL,
  "workspaceId" INTEGER      NOT NULL,
  "name"        TEXT,
  "rating"      INTEGER      NOT NULL,
  "comment"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportFeedback_reportId_idx"    ON "ReportFeedback"("reportId");
CREATE INDEX "ReportFeedback_workspaceId_idx" ON "ReportFeedback"("workspaceId");

ALTER TABLE "ReportFeedback" ADD CONSTRAINT "ReportFeedback_reportId_fkey"    FOREIGN KEY ("reportId")    REFERENCES "MonthlyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportFeedback" ADD CONSTRAINT "ReportFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")     ON DELETE CASCADE ON UPDATE CASCADE;
