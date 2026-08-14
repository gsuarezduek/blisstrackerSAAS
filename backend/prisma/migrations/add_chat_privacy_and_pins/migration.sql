-- AlterTable: ChatChannel gana isPrivate (candado admin — solo lo ven admin/owner del workspace)
ALTER TABLE "ChatChannel" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: ChatMessage gana mensajes fijados (cualquier miembro puede fijar/desfijar)
ALTER TABLE "ChatMessage" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "pinnedById" INTEGER;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_pinnedAt_idx" ON "ChatMessage"("channelId", "pinnedAt");
