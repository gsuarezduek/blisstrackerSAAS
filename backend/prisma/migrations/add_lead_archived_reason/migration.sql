-- Motivo opcional al archivar un lead (Lead.archivedReason), para poder
-- evaluar después por qué se archivan leads (análogo a Lead.lostReason).
ALTER TABLE "Lead" ADD COLUMN "archivedReason" TEXT;
