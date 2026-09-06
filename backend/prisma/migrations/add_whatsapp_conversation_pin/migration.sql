-- AlterTable: WhatsappConversation gana pin compartido (cualquier miembro puede fijar/desfijar, visible para todo el equipo)
ALTER TABLE "WhatsappConversation" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "WhatsappConversation" ADD COLUMN "pinnedById" INTEGER;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_pinnedAt_idx" ON "WhatsappConversation"("workspaceId", "pinnedAt");
