-- Situación de la cuenta: pasa de un solo campo (Project.situation, que se pisaba) a
-- hojas acumulables por proyecto. La más nueva es la actual (editable); las anteriores
-- quedan como historial de solo lectura. Nombre sin prefijo `add_` a propósito: los
-- directorios sin timestamp se aplican en orden alfabético y tiene que correr después
-- de `add_mcp_token` (FKs de agente a McpToken).
CREATE TABLE "ProjectSituationEntry" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdByAgentId" INTEGER,
    "updatedByAgentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSituationEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectSituationEntry_projectId_createdAt_idx" ON "ProjectSituationEntry"("projectId", "createdAt");

ALTER TABLE "ProjectSituationEntry" ADD CONSTRAINT "ProjectSituationEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSituationEntry" ADD CONSTRAINT "ProjectSituationEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSituationEntry" ADD CONSTRAINT "ProjectSituationEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSituationEntry" ADD CONSTRAINT "ProjectSituationEntry_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSituationEntry" ADD CONSTRAINT "ProjectSituationEntry_updatedByAgentId_fkey" FOREIGN KEY ("updatedByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La situación que ya tenía cada proyecto pasa a ser su primera hoja (sin autor: no
-- se registraba quién la escribió; fecha = última modificación del proyecto).
INSERT INTO "ProjectSituationEntry" ("projectId", "content", "createdAt", "updatedAt")
SELECT "id", "situation", "updatedAt", "updatedAt"
FROM "Project"
WHERE "situation" IS NOT NULL AND btrim("situation") <> '' AND "situation" <> '<p></p>';

ALTER TABLE "Project" DROP COLUMN "situation";
