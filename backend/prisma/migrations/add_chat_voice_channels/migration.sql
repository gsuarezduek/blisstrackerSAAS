-- Canales de voz (WebRTC mesh) sobre el Chat interno. ChatChannel gana `medium`
-- (text/voice) — mismo criterio String-no-enum que `kind`, inmutable tras crear.
-- Workspace gana `voiceChannelSeededAt` como flag de "ya se sembró el canal de voz
-- default una vez" (mismo patrón que demoSeeded/onboardingCompletedAt): el canal
-- default es kind:'custom' y por lo tanto borrable por un admin, así que la
-- materialización perezosa no puede re-chequear "existe un canal medium=voice" en
-- cada listChannels o resucitaría el canal apenas se borrara.
ALTER TABLE "ChatChannel" ADD COLUMN "medium" TEXT NOT NULL DEFAULT 'text';

ALTER TABLE "Workspace" ADD COLUMN "voiceChannelSeededAt" TIMESTAMP(3);
