-- Reuniones L10 de EOS: participantes + cronómetro + proyecto por defecto para tareas.
-- Se elimina el puntaje (rating) de la reunión.

-- EOSData: proyecto por defecto donde se crean las tareas de los participantes
ALTER TABLE "EOSData" ADD COLUMN "meetingProjectId" INTEGER;

ALTER TABLE "EOSData"
  ADD CONSTRAINT "EOSData_meetingProjectId_fkey"
  FOREIGN KEY ("meetingProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EOSMeeting: cronómetro + baja del rating
ALTER TABLE "EOSMeeting" DROP COLUMN "rating";
ALTER TABLE "EOSMeeting" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "EOSMeeting" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "EOSMeeting" ADD COLUMN "durationMins" INTEGER;

-- Participantes de la reunión L10
CREATE TABLE "EOSMeetingParticipant" (
  "id" SERIAL NOT NULL,
  "meetingId" INTEGER NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "taskId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EOSMeetingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EOSMeetingParticipant_taskId_key" ON "EOSMeetingParticipant"("taskId");
CREATE UNIQUE INDEX "EOSMeetingParticipant_meetingId_userId_key" ON "EOSMeetingParticipant"("meetingId", "userId");
CREATE INDEX "EOSMeetingParticipant_meetingId_idx" ON "EOSMeetingParticipant"("meetingId");
CREATE INDEX "EOSMeetingParticipant_workspaceId_idx" ON "EOSMeetingParticipant"("workspaceId");

ALTER TABLE "EOSMeetingParticipant"
  ADD CONSTRAINT "EOSMeetingParticipant_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "EOSMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EOSMeetingParticipant"
  ADD CONSTRAINT "EOSMeetingParticipant_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EOSMeetingParticipant"
  ADD CONSTRAINT "EOSMeetingParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EOSMeetingParticipant"
  ADD CONSTRAINT "EOSMeetingParticipant_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
