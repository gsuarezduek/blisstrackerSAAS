-- Override puntual por workspace de las cuotas de storage que SÍ bloquean
-- subidas (Archivos/Contenido/Chat). null = usa el default global de
-- PlatformSetting; 0 = ilimitado para ese workspace puntual.
ALTER TABLE "Workspace" ADD COLUMN "projectFilesMaxMbOverride" INTEGER;
ALTER TABLE "Workspace" ADD COLUMN "contentStorageMaxMbOverride" INTEGER;
ALTER TABLE "Workspace" ADD COLUMN "chatAttachmentMaxMbOverride" INTEGER;
