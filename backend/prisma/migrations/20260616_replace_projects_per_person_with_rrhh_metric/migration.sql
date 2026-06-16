-- CreateTable
CREATE TABLE "RrhhMetricSnapshot" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RrhhMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RrhhMetricSnapshot_workspaceId_idx" ON "RrhhMetricSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "RrhhMetricSnapshot_workspaceId_metric_month_key" ON "RrhhMetricSnapshot"("workspaceId", "metric", "month");

-- AddForeignKey
ALTER TABLE "RrhhMetricSnapshot" ADD CONSTRAINT "RrhhMetricSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar datos existentes de ProjectsPerPersonSnapshot (si la tabla existe)
INSERT INTO "RrhhMetricSnapshot" ("workspaceId", "metric", "month", "value", "detail", "createdAt", "updatedAt")
SELECT "workspaceId", 'projectsPerPerson', "month", "ratio",
       jsonb_build_object('activeMembers', "activeMembers", 'activeProjects', "activeProjects"),
       "createdAt", "updatedAt"
FROM "ProjectsPerPersonSnapshot";

-- DropTable
DROP TABLE "ProjectsPerPersonSnapshot";
