-- Secciones intermedias de la landing (Problem/Solution/Features/Cómo funciona/
-- Benefits/FAQ) editables desde SuperAdmin → Landing, más testimonios de
-- clientes. Los defaults de columna son triviales a propósito ('' / '[]'):
-- el copy real vive en landing.controller.js (DEFAULTS) y getContent() lo
-- mergea sobre la fila vacía, para no arriesgar un default JSON largo
-- escapado a mano en esta migración. Ver concepto "Landing" en CLAUDE.md.
ALTER TABLE "LandingContent"
  ADD COLUMN "problemTitle"       TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "problemSubtitle"    TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "problemCards"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "solutionTitle"      TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "solutionParagraph1" TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "solutionParagraph2" TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "featuresTitle"      TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "featureCards"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "stepsTitle"         TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "steps"              JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "benefitsTitle"      TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "benefitsSubtitle"   TEXT  NOT NULL DEFAULT '',
  ADD COLUMN "benefitCards"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "faqGroups"          JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "LandingTestimonial" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT '',
    "company"   TEXT NOT NULL DEFAULT '',
    "quote"     TEXT NOT NULL,
    "metric"    TEXT,
    "photoData" BYTEA,
    "mimeType"  TEXT,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingTestimonial_pkey" PRIMARY KEY ("id")
);
