-- Agentes IA en el equipo de un proyecto. Espeja ProjectMember y, como él, es una
-- ETIQUETA y no una barrera: cualquier agente puede seguir trabajando en cualquier
-- proyecto (ver "Modelo de acceso" en docs/claude/proyectos.md). Lo que da es que el
-- agente aparezca en el equipo del proyecto, se pueda filtrar por él, y que whoami le
-- diga cuáles son SUS cuentas.

CREATE TABLE "ProjectAgent" (
    "projectId" INTEGER NOT NULL,
    "agentId" INTEGER NOT NULL,

    CONSTRAINT "ProjectAgent_pkey" PRIMARY KEY ("projectId","agentId")
);

CREATE INDEX "ProjectAgent_agentId_idx" ON "ProjectAgent"("agentId");

-- Cascade en las dos puntas, a diferencia del Restrict que ProjectMember tiene por
-- default: McpToken.user ya es onDelete Cascade, así que un Restrict acá bloquearía el
-- borrado de un User.
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "McpToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
