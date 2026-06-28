-- Identidad de la cuenta de Google por integración: permite scopear la
-- propagación de tokens por cuenta (2 cuentas distintas en el mismo workspace
-- no se pisan al reconectar una).
ALTER TABLE "ProjectIntegration" ADD COLUMN "accountId" TEXT;
ALTER TABLE "ProjectIntegration" ADD COLUMN "accountEmail" TEXT;

CREATE INDEX "ProjectIntegration_workspaceId_type_accountId_idx"
  ON "ProjectIntegration"("workspaceId", "type", "accountId");
