-- CreateTable
CREATE TABLE "McpToken" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_workspaceId_idx" ON "McpToken"("workspaceId");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
