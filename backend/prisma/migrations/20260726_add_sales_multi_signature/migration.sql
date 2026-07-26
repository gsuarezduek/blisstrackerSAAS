-- Ventas: múltiples firmas por workspace (antes una sola, Workspace.salesSignature)
-- + firma elegida por propuesta (Proposal.signatureId)

ALTER TABLE "Workspace" ADD COLUMN "salesSignatures" JSONB NOT NULL DEFAULT '[]';

-- Migra la firma única existente (si tiene datos) a un array de un elemento.
UPDATE "Workspace"
SET "salesSignatures" = jsonb_build_array("salesSignature" || jsonb_build_object('id', 'primary', 'label', ''))
WHERE "salesSignature" IS NOT NULL
  AND (
    COALESCE("salesSignature"->>'name', '')    != '' OR
    COALESCE("salesSignature"->>'email', '')   != '' OR
    COALESCE("salesSignature"->>'closing', '') != '' OR
    COALESCE("salesSignature"->>'note', '')    != '' OR
    COALESCE("salesSignature"->>'phone', '')   != '' OR
    COALESCE("salesSignature"->>'role', '')    != ''
  );

ALTER TABLE "Workspace" DROP COLUMN "salesSignature";

ALTER TABLE "Proposal" ADD COLUMN "signatureId" TEXT;
