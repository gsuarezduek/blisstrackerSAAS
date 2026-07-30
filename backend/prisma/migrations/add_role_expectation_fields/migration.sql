-- Nuevos campos de RoleExpectation: competencia mínima, formación, habilidades,
-- herramientas, test del rol y guías asociadas. Ver concepto "Roles" en CLAUDE.md.
ALTER TABLE "RoleExpectation"
  ADD COLUMN "educationLevel"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN "experienceRequired" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "training"           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "skills"             JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "tools"              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "roleTestUrl"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN "guides"             JSONB NOT NULL DEFAULT '[]';
