-- Banner hero del portal de cliente (reemplaza al banner por informe, que queda deprecado).
ALTER TABLE "ProjectClientPortal" ADD COLUMN "bannerData" BYTEA;
ALTER TABLE "ProjectClientPortal" ADD COLUMN "bannerMimeType" TEXT;
