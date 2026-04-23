-- CreateTable
CREATE TABLE "ProjectIntegration" (
    "id"            SERIAL NOT NULL,
    "workspaceId"   INTEGER NOT NULL,
    "projectId"     INTEGER NOT NULL,
    "type"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'active',
    "propertyId"    TEXT,
    "customerId"    TEXT,
    "accessToken"   TEXT,
    "refreshToken"  TEXT,
    "expiresAt"     TIMESTAMP(3),
    "scopes"        TEXT NOT NULL DEFAULT '',
    "connectedById" INTEGER,
    "connectedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectIntegration_projectId_type_key" ON "ProjectIntegration"("projectId", "type");

-- CreateIndex
CREATE INDEX "ProjectIntegration_workspaceId_idx" ON "ProjectIntegration"("workspaceId");

-- CreateIndex
CREATE INDEX "ProjectIntegration_projectId_idx" ON "ProjectIntegration"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
