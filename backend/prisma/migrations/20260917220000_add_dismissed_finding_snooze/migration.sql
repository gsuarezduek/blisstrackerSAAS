-- Snooze temporal de un hallazgo ignorado: null = "Ignorar" manual (indefinido,
-- comportamiento anterior); con fecha = auto-snoozeado al crear una tarea desde el
-- hallazgo (ver concepto "Prioridades" en CLAUDE.md), vuelve a aparecer si el
-- análisis lo sigue detectando después de esa fecha.

-- AlterTable
ALTER TABLE "DismissedFinding" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
