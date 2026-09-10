-- CreateTable
CREATE TABLE "PeopleAnalyzerSnapshot" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "score" INTEGER,
    "rightPeople" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeopleAnalyzerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeopleAnalyzerSnapshot_workspaceId_idx" ON "PeopleAnalyzerSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleAnalyzerSnapshot_workspaceId_month_key" ON "PeopleAnalyzerSnapshot"("workspaceId", "month");

-- AddForeignKey
ALTER TABLE "PeopleAnalyzerSnapshot" ADD CONSTRAINT "PeopleAnalyzerSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
