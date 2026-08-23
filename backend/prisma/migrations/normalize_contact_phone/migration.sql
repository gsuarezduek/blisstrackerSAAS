-- Backfill: normaliza los Contact.phone existentes al mismo formato
-- "+<dígitos>" que ya usa WhatsappConversation.phoneE164 (lib/phone.js),
-- para que el match exacto que ahora intenta findMatchingContact
-- (whatsapp.webhook.js) también funcione sobre contactos cargados antes de
-- este cambio, no solo sobre los nuevos. Deja NULL los que no tenían ningún
-- dígito (ej. "N/A", "-"). Ya normalizados (match "^\+[0-9]+$") se saltean.
UPDATE "Contact"
SET "phone" = CASE
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') = '' THEN NULL
  ELSE '+' || regexp_replace("phone", '[^0-9]', '', 'g')
END
WHERE "phone" IS NOT NULL AND "phone" !~ '^\+[0-9]+$';
