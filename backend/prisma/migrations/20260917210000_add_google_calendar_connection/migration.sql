-- AlterTable: id del evento espejado en el Google Calendar del organizador (ver
-- googleCalendarSync.service.js). null = nunca se empujó.
ALTER TABLE "CalendarEvent" ADD COLUMN "googleEventId" TEXT;

-- CreateTable: conexión OAuth de Google Calendar, por PERSONA (no por proyecto,
-- a diferencia de ProjectIntegration) — ver GoogleCalendarConnection en schema.prisma.
CREATE TABLE "GoogleCalendarConnection" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "accountEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_workspaceId_key" ON "GoogleCalendarConnection"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "GoogleCalendarConnection_workspaceId_idx" ON "GoogleCalendarConnection"("workspaceId");

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
