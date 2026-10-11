-- AlterTable
ALTER TABLE "FeatureFlag" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'module';

-- Flags en etapa de testing (opt-in manual, panel Feature Flags)
UPDATE "FeatureFlag" SET "stage" = 'testing' WHERE "key" IN ('ventas', 'whatsapp', 'finanzas');

-- Flags "módulo" (estables): forzar enabledGlobally=true para que vengan
-- habilitados por defecto a todos los workspaces, igual que ya se hacía
-- manualmente para RRHH.
UPDATE "FeatureFlag" SET "enabledGlobally" = true WHERE "stage" = 'module';
