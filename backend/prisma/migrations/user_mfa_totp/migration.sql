-- Segundo factor (2FA) por TOTP, opt-in personal.
-- totpSecret va cifrado con AES-256-GCM (lib/encryption.js); totpConfirmedAt null
-- con secret presente = enrolamiento a medias, el login todavía no pide el código.
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpConfirmedAt" TIMESTAMP(3);

-- Códigos de recuperación: 10 por usuario, de un solo uso, sha256.
CREATE TABLE "MfaRecoveryCode" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode"("userId");

ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
