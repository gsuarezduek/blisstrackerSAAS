-- SocialImage: soporte de object storage (Cloudflare R2)
-- imageData pasa a opcional (las migradas a R2 lo dejan en NULL), y se agregan
-- objectKey (key en el bucket) y sizeBytes (peso del blob, esté en DB o en R2).
ALTER TABLE "SocialImage" ALTER COLUMN "imageData" DROP NOT NULL;
ALTER TABLE "SocialImage" ADD COLUMN "objectKey" TEXT;
ALTER TABLE "SocialImage" ADD COLUMN "sizeBytes" INTEGER;
