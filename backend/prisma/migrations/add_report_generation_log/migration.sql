-- CreateTable: log liviano de cada intento de generar/regenerar un MonthlyReport
CREATE TABLE "ReportGenerationLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER,
    "warnings" TEXT,
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportGenerationLog_reportId_idx" ON "ReportGenerationLog"("reportId");

-- CreateIndex
CREATE INDEX "ReportGenerationLog_workspaceId_idx" ON "ReportGenerationLog"("workspaceId");

-- AddForeignKey
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MonthlyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGenerationLog" ADD CONSTRAINT "ReportGenerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
