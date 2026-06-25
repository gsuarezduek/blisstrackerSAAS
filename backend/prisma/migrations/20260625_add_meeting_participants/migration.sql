-- CreateTable
CREATE TABLE "ProjectMeetingParticipant" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeetingParticipant_taskId_key" ON "ProjectMeetingParticipant"("taskId");

-- CreateIndex
CREATE INDEX "ProjectMeetingParticipant_meetingId_idx" ON "ProjectMeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "ProjectMeetingParticipant_workspaceId_idx" ON "ProjectMeetingParticipant"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeetingParticipant_meetingId_userId_key" ON "ProjectMeetingParticipant"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectMeetingParticipant" ADD CONSTRAINT "ProjectMeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "ProjectMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingParticipant" ADD CONSTRAINT "ProjectMeetingParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingParticipant" ADD CONSTRAINT "ProjectMeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeetingParticipant" ADD CONSTRAINT "ProjectMeetingParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
