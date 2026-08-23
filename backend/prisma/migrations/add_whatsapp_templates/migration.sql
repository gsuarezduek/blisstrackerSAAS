-- Cache local de plantillas aprobadas por Meta (Fase 5 del plan) — solo
-- lectura, sincronizadas desde el catálogo de Chakra por wabaId. Sirven para
-- reabrir una conversación fuera de la ventana de 24hs.

-- CreateTable
CREATE TABLE "WhatsappTemplate" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bodyText" TEXT,
    "variableCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappTemplate_workspaceId_idx" ON "WhatsappTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappTemplate_accountId_externalId_key" ON "WhatsappTemplate"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsappAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
