-- Multi-contacto del portal de cliente.
-- ClientPortalContact pasa a ser la fuente de verdad del login OTP; el
-- ProjectClientPortal.clientEmail queda legacy (nullable) durante un release por
-- rollback y se backfillea 1:1, de modo que los portales existentes conservan
-- exactamente el comportamiento actual.

-- CreateTable
CREATE TABLE "ClientPortalContact" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "portalId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "canApprove" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalContact_portalId_email_key" ON "ClientPortalContact"("portalId", "email");
CREATE INDEX "ClientPortalContact_portalId_active_idx" ON "ClientPortalContact"("portalId", "active");
CREATE INDEX "ClientPortalContact_workspaceId_idx" ON "ClientPortalContact"("workspaceId");

-- AddForeignKey
ALTER TABLE "ClientPortalContact" ADD CONSTRAINT "ClientPortalContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalContact" ADD CONSTRAINT "ClientPortalContact_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "ProjectClientPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: clientEmail pasa a legacy nullable + flag del tab Contenido
ALTER TABLE "ProjectClientPortal" ALTER COLUMN "clientEmail" DROP NOT NULL;
ALTER TABLE "ProjectClientPortal" ADD COLUMN "contentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: el código OTP queda ligado al contacto que lo pidió
ALTER TABLE "ClientPortalLoginCode" ADD COLUMN "contactId" INTEGER;
ALTER TABLE "ClientPortalLoginCode" ADD CONSTRAINT "ClientPortalLoginCode_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientPortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El rate limit del OTP pasa de por-portal a por-(portal, email): con varios
-- contactos, un límite por portal se agotaría con un login de cada uno.
DROP INDEX IF EXISTS "ClientPortalLoginCode_portalId_createdAt_idx";
CREATE INDEX "ClientPortalLoginCode_portalId_email_createdAt_idx" ON "ClientPortalLoginCode"("portalId", "email", "createdAt");

-- Backfill: cada portal existente queda con su contacto único, mismo email.
INSERT INTO "ClientPortalContact" ("workspaceId", "portalId", "email", "name", "createdAt", "updatedAt")
SELECT "workspaceId", "id", lower("clientEmail"), "clientName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ProjectClientPortal"
WHERE "clientEmail" IS NOT NULL
ON CONFLICT ("portalId", "email") DO NOTHING;
