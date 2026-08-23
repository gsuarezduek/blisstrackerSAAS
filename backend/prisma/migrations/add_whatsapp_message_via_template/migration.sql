-- Fase 6 del plan de WhatsApp (analítica y costo/uso): distingue los
-- mensajes salientes que abrieron/reabrieron una conversación con una
-- plantilla aprobada (lo único que Meta factura como conversación iniciada
-- por el negocio) del resto de los replies de texto libre. Default false —
-- los mensajes existentes no se reclasifican retroactivamente (no hay forma
-- confiable de saber cuáles fueron plantilla sin volver a leer el contenido
-- renderizado contra el catálogo de templates, y el volumen es chico).

-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN "viaTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WhatsappMessage_workspaceId_createdAt_idx" ON "WhatsappMessage"("workspaceId", "createdAt");
