-- Registro agregado de los intentos de autenticación de MCP rechazados.
-- Una fila por valor rechazado (no por intento): ver el comentario del modelo
-- en schema.prisma.
CREATE TABLE "McpAuthFailure" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "hashPrefix" TEXT,
    "tokenId" INTEGER,
    "workspaceId" INTEGER,
    "userId" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAuthFailure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpAuthFailure_fingerprint_key" ON "McpAuthFailure"("fingerprint");
CREATE INDEX "McpAuthFailure_tokenId_idx" ON "McpAuthFailure"("tokenId");
CREATE INDEX "McpAuthFailure_lastAt_idx" ON "McpAuthFailure"("lastAt");

ALTER TABLE "McpAuthFailure" ADD CONSTRAINT "McpAuthFailure_tokenId_fkey"
    FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Antiflood del aviso por mail (ver mcp/auth.js).
ALTER TABLE "McpToken" ADD COLUMN "revokedNoticeAt" TIMESTAMP(3);
