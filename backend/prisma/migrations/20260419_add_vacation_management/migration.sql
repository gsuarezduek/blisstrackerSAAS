-- CreateTable VacationAdjustment: historial de cambios de días por admins
CREATE TABLE "VacationAdjustment" (
    "id"          SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId"      INTEGER NOT NULL,
    "adminId"     INTEGER NOT NULL,
    "prevDays"    INTEGER NOT NULL,
    "newDays"     INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable VacationRequest: solicitudes de licencia por usuarios
CREATE TABLE "VacationRequest" (
    "id"          SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId"      INTEGER NOT NULL,
    "startDate"   TEXT NOT NULL,
    "endDate"     TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "observation" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy"  INTEGER,
    "reviewedAt"  TIMESTAMP(3),
    "reviewNote"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VacationAdjustment" ADD CONSTRAINT "VacationAdjustment_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VacationAdjustment" ADD CONSTRAINT "VacationAdjustment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VacationAdjustment" ADD CONSTRAINT "VacationAdjustment_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "VacationAdjustment_workspaceId_userId_idx" ON "VacationAdjustment"("workspaceId", "userId");
CREATE INDEX "VacationRequest_workspaceId_userId_idx" ON "VacationRequest"("workspaceId", "userId");
CREATE INDEX "VacationRequest_workspaceId_status_idx" ON "VacationRequest"("workspaceId", "status");
