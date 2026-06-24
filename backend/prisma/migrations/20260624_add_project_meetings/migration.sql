-- CreateTable
CREATE TABLE "ProjectMeeting" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'internal',
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMins" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMeetingTodo" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "taskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMeetingTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMeeting_projectId_idx" ON "ProjectMeeting"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMeeting_workspaceId_idx" ON "ProjectMeeting"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeetingTodo_taskId_key" ON "ProjectMeetingTodo"("taskId");

-- CreateIndex
CREATE INDEX "ProjectMeetingTodo_meetingId_idx" ON "ProjectMeetingTodo"("meetingId");

-- CreateIndex
CREATE INDEX "ProjectMeetingTodo_workspaceId_idx" ON "ProjectMeetingTodo"("workspaceId");

-- AddForeignKey
ALTER TABLE "ProjectMeeting" ADD CONSTRAINT "ProjectMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeeting" ADD CONSTRAINT "ProjectMeeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingTodo" ADD CONSTRAINT "ProjectMeetingTodo_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "ProjectMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingTodo" ADD CONSTRAINT "ProjectMeetingTodo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingTodo" ADD CONSTRAINT "ProjectMeetingTodo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingTodo" ADD CONSTRAINT "ProjectMeetingTodo_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
