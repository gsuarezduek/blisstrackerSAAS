-- Índice compuesto para acelerar la agregación de presupuesto de tokens de IA por
-- workspace + mes (getMonthlyTokenUsed): se llama en el hot path del insight diario.
CREATE INDEX "AiTokenLog_workspaceId_createdAt_idx" ON "AiTokenLog"("workspaceId", "createdAt");
