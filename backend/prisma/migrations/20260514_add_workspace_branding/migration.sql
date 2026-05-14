-- AddColumn: workspace branding fields
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "companyName"        TEXT,
  ADD COLUMN IF NOT EXISTS "companyDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "industry"           TEXT,
  ADD COLUMN IF NOT EXISTS "companyWebsite"     TEXT,
  ADD COLUMN IF NOT EXISTS "logoData"           BYTEA,
  ADD COLUMN IF NOT EXISTS "logoMimeType"       TEXT,
  ADD COLUMN IF NOT EXISTS "bannerData"         BYTEA,
  ADD COLUMN IF NOT EXISTS "bannerMimeType"     TEXT;
