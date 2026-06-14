-- CreateTable
CREATE TABLE "NotesBoardNote" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotesBoardNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotesBoardNote_userId_idx" ON "NotesBoardNote"("userId");

-- CreateIndex
CREATE INDEX "NotesBoardNote_workspaceId_idx" ON "NotesBoardNote"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotesBoardNote_userId_workspaceId_columnIndex_key" ON "NotesBoardNote"("userId", "workspaceId", "columnIndex");

-- AddForeignKey
ALTER TABLE "NotesBoardNote" ADD CONSTRAINT "NotesBoardNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotesBoardNote" ADD CONSTRAINT "NotesBoardNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
