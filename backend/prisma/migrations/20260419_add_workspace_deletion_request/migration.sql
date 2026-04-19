-- CreateTable
CREATE TABLE "WorkspaceDeletionRequest" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDeletionRequest_workspaceId_key" ON "WorkspaceDeletionRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceDeletionRequest_scheduledAt_idx" ON "WorkspaceDeletionRequest"("scheduledAt");

-- AddForeignKey
ALTER TABLE "WorkspaceDeletionRequest" ADD CONSTRAINT "WorkspaceDeletionRequest_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceDeletionRequest" ADD CONSTRAINT "WorkspaceDeletionRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceDeletionRequest" ADD CONSTRAINT "WorkspaceDeletionRequest_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
