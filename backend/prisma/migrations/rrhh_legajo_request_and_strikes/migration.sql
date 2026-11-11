-- RRHH: pedir un legajo, y strikes que dejan de estar activos.

-- "Pedírselo": el admin le pide a la persona los campos que faltan. Hasta ahora
-- el único aviso del legajo iba en sentido contrario (LEGAJO_UPDATED, la persona
-- completa → se avisa al admin); no existía el camino de ida.
ALTER TYPE "NotificationType" ADD VALUE 'LEGAJO_REQUESTED';

-- ── Strikes ──────────────────────────────────────────────────────────────────
-- Un strike ahora lleva el ACUERDO al que se llegó (de qué sirve registrar la
-- falta si no queda qué se pactó), y deja de estar activo de dos maneras: vence
-- solo a los N meses, o alguien lo levanta antes dejando el motivo.
ALTER TABLE "EOSStrike" ADD COLUMN "agreement" TEXT;
ALTER TABLE "EOSStrike" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "EOSStrike" ADD COLUMN "liftedAt" TIMESTAMP(3);
ALTER TABLE "EOSStrike" ADD COLUMN "liftedById" INTEGER;
ALTER TABLE "EOSStrike" ADD COLUMN "liftReason" TEXT;

ALTER TABLE "EOSStrike" ADD CONSTRAINT "EOSStrike_liftedById_fkey"
  FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los strikes que ya existen quedan con vencimiento a 12 meses de su fecha, el
-- mismo default del workspace. Sin esto, `expiresAt` null tendría que leerse como
-- "no vence nunca" y los strikes viejos contarían para siempre — que es
-- justamente el problema que esta migración resuelve.
UPDATE "EOSStrike" SET "expiresAt" = "createdAt" + INTERVAL '12 months' WHERE "expiresAt" IS NULL;

-- Plazo configurable por workspace. 0 = los strikes no vencen por tiempo (solo
-- se levantan a mano).
ALTER TABLE "Workspace" ADD COLUMN "strikeExpiryMonths" INTEGER NOT NULL DEFAULT 12;

-- ── 1on1 ─────────────────────────────────────────────────────────────────────
-- La conversación de seguimiento entre quien lidera y la persona. NO reusa
-- ProjectMeeting (necesita un proyecto y factura tiempo al cliente) ni EOSMeeting
-- (es semanal y de todo el equipo): un 1on1 no se cobra y es de a dos.
CREATE TABLE "OneOnOne" (
  "id"          SERIAL NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "userId"      INTEGER NOT NULL,   -- de quién es el 1on1
  "leaderId"    INTEGER,            -- quién lo tuvo; SetNull para no perder el registro si se va
  "date"        TEXT NOT NULL,      -- "YYYY-MM-DD" en la tz del workspace, como WorkDay.date
  "notes"       TEXT,
  "strikeId"    INTEGER,            -- si salió de un strike, para "revisar el acuerdo"
  "createdById" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OneOnOne_workspaceId_date_idx" ON "OneOnOne"("workspaceId", "date");
CREATE INDEX "OneOnOne_userId_idx" ON "OneOnOne"("userId");

ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_leaderId_fkey"
  FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_strikeId_fkey"
  FOREIGN KEY ("strikeId") REFERENCES "EOSStrike"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los acuerdos del 1on1. Tabla propia y no un campo de texto porque lo que se
-- revisa en el siguiente 1on1 es si se cumplieron, uno por uno.
CREATE TABLE "OneOnOneAgreement" (
  "id"          SERIAL NOT NULL,
  "oneOnOneId"  INTEGER NOT NULL,
  "text"        TEXT NOT NULL,
  "done"        BOOLEAN NOT NULL DEFAULT false,
  "doneAt"      TIMESTAMP(3),
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OneOnOneAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OneOnOneAgreement_oneOnOneId_idx" ON "OneOnOneAgreement"("oneOnOneId");

ALTER TABLE "OneOnOneAgreement" ADD CONSTRAINT "OneOnOneAgreement_oneOnOneId_fkey"
  FOREIGN KEY ("oneOnOneId") REFERENCES "OneOnOne"("id") ON DELETE CASCADE ON UPDATE CASCADE;
