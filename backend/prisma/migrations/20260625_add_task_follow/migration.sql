-- CreateTable
CREATE TABLE "TaskFollow" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskFollow_userId_workspaceId_idx" ON "TaskFollow"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "TaskFollow_taskId_idx" ON "TaskFollow"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskFollow_taskId_userId_key" ON "TaskFollow"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskFollow" ADD CONSTRAINT "TaskFollow_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollow" ADD CONSTRAINT "TaskFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollow" ADD CONSTRAINT "TaskFollow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
