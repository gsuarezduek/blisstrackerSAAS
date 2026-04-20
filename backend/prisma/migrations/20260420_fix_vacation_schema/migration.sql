-- Fix: renombrar columna "reviewedBy" → "reviewedById" en VacationRequest
-- La migración original usó el nombre incorrecto que no coincide con el schema de Prisma.
ALTER TABLE "VacationRequest" RENAME COLUMN "reviewedBy" TO "reviewedById";

-- Agregar tipos de notificación para vacaciones
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VACATION_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VACATION_REVIEWED';
