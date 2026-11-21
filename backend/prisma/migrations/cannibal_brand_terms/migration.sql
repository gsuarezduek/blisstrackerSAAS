-- Términos de marca por proyecto para el análisis de canibalización.
-- Una búsqueda de marca ("mdz rent a car") no es canibalización: no corresponde
-- consolidar ni canonicalizar, solo verificar que gane la URL esperada.
-- Los términos los confirma una persona (el sistema sugiere a partir de Search Console);
-- no se derivan solos del dominio porque un token del dominio puede ser genérico
-- ("car" está dentro de "mdzrentacar" y es la keyword más importante del negocio).
ALTER TABLE "Project" ADD COLUMN "cannibalBrandTerms" TEXT NOT NULL DEFAULT '[]';

-- URL que se espera que gane las búsquedas de marca. NULL = la home del sitio.
ALTER TABLE "Project" ADD COLUMN "cannibalBrandUrl" TEXT;
