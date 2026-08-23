-- Link público de solo lectura para compartir una propuesta con el cliente
-- (mismo criterio que MonthlyReport.token: el link siempre existe, pero
-- GET /api/public/proposal/:token solo la sirve si status:'confirmed').
-- Backfill con gen_random_uuid() para las filas existentes — de acá en más
-- se genera en código (crypto.randomUUID(), createProposal), no vía default
-- de columna, mismo patrón que MonthlyReport.token.

-- AddColumn
ALTER TABLE "Proposal" ADD COLUMN "publicToken" TEXT;

-- Backfill
UPDATE "Proposal" SET "publicToken" = gen_random_uuid()::text WHERE "publicToken" IS NULL;

-- Enforce NOT NULL + unicidad
ALTER TABLE "Proposal" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Proposal_publicToken_key" ON "Proposal"("publicToken");
