-- AlterTable: firma/datos de contacto para el PDF de la propuesta
ALTER TABLE "Workspace" ADD COLUMN "salesSignature" JSONB NOT NULL DEFAULT '{}';
