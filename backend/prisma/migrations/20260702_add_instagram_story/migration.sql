-- CreateTable: historias (stories) de Instagram, capturadas a diario (efímeras 24h)
CREATE TABLE "InstagramStory" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "storyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT,
    "imgSrc" TEXT,
    "permalink" TEXT,
    "reach" INTEGER,
    "replies" INTEGER,
    "views" INTEGER,
    "tapsForward" INTEGER,
    "tapsBack" INTEGER,
    "exits" INTEGER,
    "insightsRaw" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramStory_projectId_storyId_key" ON "InstagramStory"("projectId", "storyId");
CREATE INDEX "InstagramStory_workspaceId_idx" ON "InstagramStory"("workspaceId");
CREATE INDEX "InstagramStory_projectId_month_idx" ON "InstagramStory"("projectId", "month");

-- AddForeignKey
ALTER TABLE "InstagramStory" ADD CONSTRAINT "InstagramStory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramStory" ADD CONSTRAINT "InstagramStory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
