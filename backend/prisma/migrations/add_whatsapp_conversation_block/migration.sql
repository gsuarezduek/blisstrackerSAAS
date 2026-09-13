-- AlterTable: WhatsappConversation gana spam/bloqueo (cualquier miembro con acceso a Ventas puede marcar/desmarcar)
ALTER TABLE "WhatsappConversation" ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsappConversation" ADD COLUMN "blockedAt" TIMESTAMP(3);
ALTER TABLE "WhatsappConversation" ADD COLUMN "blockedById" INTEGER;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_isBlocked_idx" ON "WhatsappConversation"("workspaceId", "isBlocked");
