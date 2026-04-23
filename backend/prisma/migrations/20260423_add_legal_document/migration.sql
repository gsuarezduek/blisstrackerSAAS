-- CreateTable
CREATE TABLE "LegalDocument" (
    "id"        SERIAL NOT NULL,
    "key"       TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "content"   TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_key_key" ON "LegalDocument"("key");

-- Seed: crear los documentos legales iniciales vacíos
INSERT INTO "LegalDocument" ("key", "title", "content", "updatedAt")
VALUES
  ('terms_of_service', 'Condiciones de Uso',      '', NOW()),
  ('privacy_policy',   'Política de Privacidad',  '', NOW());
