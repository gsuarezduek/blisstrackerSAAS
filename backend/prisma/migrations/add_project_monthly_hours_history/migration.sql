-- Historiza Project.monthlyHours por mes calendario, para que el % de uso de
-- un mes pasado se compare contra el valor vigente ENTONCES, no contra el
-- valor actual (ver concepto "Reportes → Proyectos" en CLAUDE.md).

-- CreateTable
CREATE TABLE "ProjectMonthlyHoursLog" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "monthlyHours" INTEGER,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMonthlyHoursLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMonthlyHoursLog_projectId_effectiveFrom_key" ON "ProjectMonthlyHoursLog"("projectId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ProjectMonthlyHoursLog_projectId_effectiveFrom_idx" ON "ProjectMonthlyHoursLog"("projectId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ProjectMonthlyHoursLog" ADD CONSTRAINT "ProjectMonthlyHoursLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: un registro por proyecto existente, con el valor actual de
-- monthlyHours, vigente desde el mes de creación del proyecto en su propia
-- timezone. No inventa historial: simplemente preserva el comportamiento
-- actual (comparar contra el valor de hoy) para todo lo anterior a este
-- cambio; solo las ediciones futuras de monthlyHours generan un nuevo
-- escalón a partir de acá.
INSERT INTO "ProjectMonthlyHoursLog" ("projectId", "monthlyHours", "effectiveFrom", "createdAt")
SELECT p."id", p."monthlyHours",
       to_char((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE p."timezone", 'YYYY-MM'),
       NOW()
FROM "Project" p
ON CONFLICT ("projectId", "effectiveFrom") DO NOTHING;
