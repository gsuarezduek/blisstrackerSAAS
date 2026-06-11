-- CreateTable
CREATE TABLE "SocialImage" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "imageData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialImage_workspaceId_idx" ON "SocialImage"("workspaceId");

-- AddForeignKey
ALTER TABLE "SocialImage" ADD CONSTRAINT "SocialImage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
