-- AlterEnum: nuevo tipo de notificación para menciones en el chat interno
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MENTION';

-- CreateTable: ChatChannel — #general + un canal por proyecto + canales custom creados por admins.
-- Sin tabla de membership: cualquier WorkspaceMember activo ve y participa en cualquier canal.
CREATE TABLE "ChatChannel" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "projectId" INTEGER,
    "createdById" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatMessage
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT,
    "gifUrl" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatChannelRead — último mensaje leído por (canal, usuario). No hay
-- un registro de lectura por mensaje: los no-leídos se resuelven comparando
-- ChatMessage.id > lastReadMessageId, así escala con canales × usuarios activos.
CREATE TABLE "ChatChannelRead" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastReadMessageId" INTEGER,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatChannelRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_projectId_key" ON "ChatChannel"("projectId");
CREATE UNIQUE INDEX "ChatChannel_workspaceId_slug_key" ON "ChatChannel"("workspaceId", "slug");
CREATE INDEX "ChatChannel_workspaceId_idx" ON "ChatChannel"("workspaceId");

CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");
CREATE INDEX "ChatMessage_workspaceId_idx" ON "ChatMessage"("workspaceId");

CREATE UNIQUE INDEX "ChatChannelRead_channelId_userId_key" ON "ChatChannelRead"("channelId", "userId");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatChannelRead" ADD CONSTRAINT "ChatChannelRead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannelRead" ADD CONSTRAINT "ChatChannelRead_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannelRead" ADD CONSTRAINT "ChatChannelRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Notification gana los campos opcionales para deep-linkear una CHAT_MENTION a su canal/mensaje
ALTER TABLE "Notification" ADD COLUMN "channelId" INTEGER;
ALTER TABLE "Notification" ADD COLUMN "chatMessageId" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
