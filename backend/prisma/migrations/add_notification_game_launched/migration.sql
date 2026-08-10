-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GAME_LAUNCHED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "gameId" INTEGER;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
