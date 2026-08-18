-- Assets tipo "link": referencia externa (Google Drive, etc.) en vez de un
-- archivo subido a R2. mimeType pasa a nullable (un link no tiene MIME);
-- sourceUrl guarda la URL externa.
ALTER TABLE "ContentAsset" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "ContentAsset" ADD COLUMN "sourceUrl" TEXT;
