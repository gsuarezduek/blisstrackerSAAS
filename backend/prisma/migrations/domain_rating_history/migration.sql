-- Historial de Domain Rating. Hasta acá Project.domainRating era un solo número:
-- cada "Actualizar DR" pisaba el anterior. Cada lectura exitosa queda, y la card
-- muestra las últimas como las pastillas de Web → Performance.

CREATE TABLE "DomainRatingReading" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "domainRating" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainRatingReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DomainRatingReading_projectId_createdAt_idx" ON "DomainRatingReading"("projectId", "createdAt");
CREATE INDEX "DomainRatingReading_workspaceId_idx" ON "DomainRatingReading"("workspaceId");

ALTER TABLE "DomainRatingReading" ADD CONSTRAINT "DomainRatingReading_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainRatingReading" ADD CONSTRAINT "DomainRatingReading_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lo que ya se había medido: el DR de cada snapshot mensual de SEO, y el valor
-- cacheado del proyecto si no es exactamente esa misma lectura.
INSERT INTO "DomainRatingReading" ("projectId", "workspaceId", "domainRating", "createdAt")
SELECT s."projectId", s."workspaceId", s."domainRating", s."updatedAt"
FROM "SearchConsoleSnapshot" s
WHERE s."domainRating" IS NOT NULL;

INSERT INTO "DomainRatingReading" ("projectId", "workspaceId", "domainRating", "createdAt")
SELECT p."id", p."workspaceId", p."domainRating", p."domainRatingAt"
FROM "Project" p
WHERE p."domainRating" IS NOT NULL
  AND p."domainRatingAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DomainRatingReading" r
    WHERE r."projectId" = p."id"
      AND r."domainRating" = p."domainRating"
      AND r."createdAt" = p."domainRatingAt"
  );
