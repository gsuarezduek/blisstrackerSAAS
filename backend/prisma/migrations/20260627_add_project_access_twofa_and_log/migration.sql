-- AlterTable: 2FA cifrado opcional en cada acceso
ALTER TABLE "ProjectAccess" ADD COLUMN "twofa" TEXT;

-- CreateTable: log de auditoría de solicitudes de ver datos sensibles (password / 2FA)
CREATE TABLE "ProjectAccessLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "accessId" INTEGER,
    "userId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectAccessLog_workspaceId_idx" ON "ProjectAccessLog"("workspaceId");

-- CreateIndex
CREATE INDEX "ProjectAccessLog_projectId_idx" ON "ProjectAccessLog"("projectId");

-- CreateIndex
CREATE INDEX "ProjectAccessLog_accessId_idx" ON "ProjectAccessLog"("accessId");

-- CreateIndex
CREATE INDEX "ProjectAccessLog_userId_idx" ON "ProjectAccessLog"("userId");

-- AddForeignKey
ALTER TABLE "ProjectAccessLog" ADD CONSTRAINT "ProjectAccessLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccessLog" ADD CONSTRAINT "ProjectAccessLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccessLog" ADD CONSTRAINT "ProjectAccessLog_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "ProjectAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccessLog" ADD CONSTRAINT "ProjectAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
