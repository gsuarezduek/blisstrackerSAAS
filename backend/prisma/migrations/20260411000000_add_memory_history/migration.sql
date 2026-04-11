-- Drop the old single-user unique constraint
ALTER TABLE "UserInsightMemory" DROP CONSTRAINT IF EXISTS "UserInsightMemory_userId_key";

-- Add composite unique constraint: one record per user per week
ALTER TABLE "UserInsightMemory" ADD CONSTRAINT "UserInsightMemory_userId_weekStart_key"
  UNIQUE ("userId", "weekStart");

-- Add index for userId-only queries
CREATE INDEX IF NOT EXISTS "UserInsightMemory_userId_idx" ON "UserInsightMemory"("userId");
