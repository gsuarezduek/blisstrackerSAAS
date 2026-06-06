-- CreateTable
CREATE TABLE "ProjectBrief" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBrief_projectId_idx" ON "ProjectBrief"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBrief_workspaceId_idx" ON "ProjectBrief"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrief_projectId_type_key" ON "ProjectBrief"("projectId", "type");

-- AddForeignKey
ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
