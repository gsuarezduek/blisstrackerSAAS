-- Portal de cliente: acceso externo por proyecto (Informes+Briefs abiertos, "Datos en vivo" con OTP por email).
CREATE TABLE "ProjectClientPortal" (
  "id"               SERIAL       NOT NULL,
  "workspaceId"      INTEGER      NOT NULL,
  "projectId"        INTEGER      NOT NULL,
  "slug"             TEXT         NOT NULL,
  "clientEmail"      TEXT         NOT NULL,
  "clientName"       TEXT,
  "active"           BOOLEAN      NOT NULL DEFAULT true,
  "liveSections"     TEXT         NOT NULL DEFAULT '[]',
  "liveDataCache"    TEXT,
  "liveDataCachedAt" TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectClientPortal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectClientPortal_projectId_key" ON "ProjectClientPortal"("projectId");
CREATE UNIQUE INDEX "ProjectClientPortal_slug_key"       ON "ProjectClientPortal"("slug");
CREATE INDEX "ProjectClientPortal_workspaceId_idx"       ON "ProjectClientPortal"("workspaceId");

ALTER TABLE "ProjectClientPortal" ADD CONSTRAINT "ProjectClientPortal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectClientPortal" ADD CONSTRAINT "ProjectClientPortal_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientPortalLoginCode" (
  "id"        SERIAL       NOT NULL,
  "portalId"  INTEGER      NOT NULL,
  "email"     TEXT         NOT NULL,
  "code"      TEXT         NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used"      BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortalLoginCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientPortalLoginCode_portalId_createdAt_idx" ON "ClientPortalLoginCode"("portalId", "createdAt");

ALTER TABLE "ClientPortalLoginCode" ADD CONSTRAINT "ClientPortalLoginCode_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "ProjectClientPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
