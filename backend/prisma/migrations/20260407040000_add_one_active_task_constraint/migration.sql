-- Clean up any duplicate IN_PROGRESS tasks before adding constraint
-- (keeps the most recently created one per user, pauses the rest)
UPDATE "Task" SET status = 'PAUSED', "pausedAt" = NOW()
WHERE status = 'IN_PROGRESS'
  AND id NOT IN (
    SELECT DISTINCT ON ("userId") id
    FROM "Task"
    WHERE status = 'IN_PROGRESS'
    ORDER BY "userId", "createdAt" DESC
  );

-- Unique partial index: only one IN_PROGRESS task per user at the DB level
CREATE UNIQUE INDEX "one_active_task_per_user"
ON "Task"("userId")
WHERE status = 'IN_PROGRESS';
