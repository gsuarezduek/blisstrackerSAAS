-- CreateTable: TaskCommentReaction — reacciones con emoji sobre comentarios de tareas.
-- Mismo patrón que ChatMessageReaction: sin catálogo fijo, toggle por (comentario, usuario, emoji).
CREATE TABLE "TaskCommentReaction" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentReaction_commentId_userId_emoji_key" ON "TaskCommentReaction"("commentId", "userId", "emoji");
CREATE INDEX "TaskCommentReaction_commentId_idx" ON "TaskCommentReaction"("commentId");

-- AddForeignKey
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCommentReaction" ADD CONSTRAINT "TaskCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
