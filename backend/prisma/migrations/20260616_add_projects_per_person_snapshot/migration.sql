-- CreateTable
CREATE TABLE "ProjectsPerPersonSnapshot" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "activeProjects" INTEGER NOT NULL DEFAULT 0,
    "ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectsPerPersonSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectsPerPersonSnapshot_workspaceId_idx" ON "ProjectsPerPersonSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectsPerPersonSnapshot_workspaceId_month_key" ON "ProjectsPerPersonSnapshot"("workspaceId", "month");

-- AddForeignKey
ALTER TABLE "ProjectsPerPersonSnapshot" ADD CONSTRAINT "ProjectsPerPersonSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
