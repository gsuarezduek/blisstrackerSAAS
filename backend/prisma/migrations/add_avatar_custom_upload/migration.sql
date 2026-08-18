-- Avatar: soporte de foto propia subida por el usuario (privada, no forma
-- parte del catálogo curado) + object storage (Cloudflare R2), mismo patrón
-- dual que SocialImage: imageData pasa a opcional, se agregan objectKey y
-- sizeBytes, y ownerId (único) vincula el avatar a su dueño.
ALTER TABLE "Avatar" ALTER COLUMN "imageData" DROP NOT NULL;
ALTER TABLE "Avatar" ADD COLUMN "objectKey" TEXT;
ALTER TABLE "Avatar" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Avatar" ADD COLUMN "ownerId" INTEGER;

CREATE UNIQUE INDEX "Avatar_ownerId_key" ON "Avatar"("ownerId");

ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
