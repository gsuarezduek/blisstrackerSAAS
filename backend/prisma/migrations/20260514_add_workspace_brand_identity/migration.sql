-- AddColumn: brand identity — color palette and typography
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "brandColors" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "brandFonts"  TEXT NOT NULL DEFAULT '[]';
