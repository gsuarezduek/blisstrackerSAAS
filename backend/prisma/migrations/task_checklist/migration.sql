-- Subtareas de una tarea (checklist). A propósito NO son Task: una subtarea no tiene
-- jornada, estado, tiempo ni responsable, y si lo fuera la contarían dos veces el
-- resumen del día, Reportes/Productividad, el insight diario y el tiempo de agente
-- que se le cobra al cliente. Acá es texto + tilde.
CREATE TABLE "TaskChecklistItem" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskChecklistItem_taskId_order_idx" ON "TaskChecklistItem"("taskId", "order");

-- Borrar la tarea se lleva sus subtareas; borrar al usuario que tildó deja el tilde puesto.
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_doneById_fkey"
    FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Subtareas plantilla de una recurrencia: JSON de strings (mismo patrón que weekdays).
-- Sin esto, cada ocurrencia de una tarea recurrente nacería con el checklist vacío.
ALTER TABLE "TaskRecurrence" ADD COLUMN "checklist" TEXT;
