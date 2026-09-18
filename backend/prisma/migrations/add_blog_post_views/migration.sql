-- Contador simple de vistas por post del blog público, visible desde SuperAdmin.
ALTER TABLE "BlogPost" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0;
