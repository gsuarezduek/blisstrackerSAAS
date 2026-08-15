-- Módulo Contenido: calendario de piezas de RRSS por proyecto.
-- El workflow de estados es fijo y vive en backend/src/lib/contentCatalog.js,
-- por eso ContentPiece.status es TEXT y no un enum de Postgres.

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "type" TEXT NOT NULL DEFAULT 'post',
    "networks" TEXT NOT NULL DEFAULT '[]',
    "copy" TEXT,
    "hashtags" TEXT,
    "internalNotes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "scheduledDate" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "ownerId" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "taskId" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByContactId" INTEGER,
    "changesRequestedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mimeType" TEXT NOT NULL,
    "objectKey" TEXT,
    "imageData" BYTEA,
    "posterKey" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "fileName" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentComment" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL,
    "authorUserId" INTEGER,
    "authorContactId" INTEGER,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentStatusEvent" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorUserId" INTEGER,
    "actorContactId" INTEGER,
    "actorName" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPiece_taskId_key" ON "ContentPiece"("taskId");
CREATE INDEX "ContentPiece_workspaceId_idx" ON "ContentPiece"("workspaceId");
CREATE INDEX "ContentPiece_projectId_scheduledDate_idx" ON "ContentPiece"("projectId", "scheduledDate");
CREATE INDEX "ContentPiece_projectId_status_order_idx" ON "ContentPiece"("projectId", "status", "order");
CREATE INDEX "ContentPiece_projectId_updatedAt_idx" ON "ContentPiece"("projectId", "updatedAt");
CREATE UNIQUE INDEX "ContentAsset_publicId_key" ON "ContentAsset"("publicId");
CREATE INDEX "ContentAsset_pieceId_order_idx" ON "ContentAsset"("pieceId", "order");
CREATE INDEX "ContentAsset_workspaceId_idx" ON "ContentAsset"("workspaceId");
CREATE INDEX "ContentAsset_status_createdAt_idx" ON "ContentAsset"("status", "createdAt");
CREATE INDEX "ContentComment_pieceId_visibility_createdAt_idx" ON "ContentComment"("pieceId", "visibility", "createdAt");
CREATE INDEX "ContentComment_workspaceId_idx" ON "ContentComment"("workspaceId");
CREATE INDEX "ContentStatusEvent_pieceId_createdAt_idx" ON "ContentStatusEvent"("pieceId", "createdAt");
CREATE INDEX "ContentStatusEvent_workspaceId_idx" ON "ContentStatusEvent"("workspaceId");

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_approvedByContactId_fkey" FOREIGN KEY ("approvedByContactId") REFERENCES "ClientPortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_authorContactId_fkey" FOREIGN KEY ("authorContactId") REFERENCES "ClientPortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentStatusEvent" ADD CONSTRAINT "ContentStatusEvent_actorContactId_fkey" FOREIGN KEY ("actorContactId") REFERENCES "ClientPortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
