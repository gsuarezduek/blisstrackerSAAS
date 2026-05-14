-- AddColumn: workspace opt-out de feature flags habilitados por SuperAdmin
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "disabledFeatureKeys" TEXT NOT NULL DEFAULT '[]';
