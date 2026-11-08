-- Marketing y Contenido se prenden/apagan POR PROYECTO: no todas las cuentas
-- llevan marketing ni calendario de contenido, y hasta ahora la única palanca era
-- el feature flag del workspace (todo o nada para todos los proyectos).

-- Default `true` a propósito: los proyectos que ya existen siguen exactamente como
-- estaban el día del deploy. Apagar un módulo es una decisión que se toma proyecto
-- por proyecto; deducirla de los datos (¿tiene integraciones?, ¿tiene piezas?)
-- haría desaparecer secciones que alguien estaba usando sin haberlo pedido.
ALTER TABLE "Project" ADD COLUMN "marketingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "contenidoEnabled" BOOLEAN NOT NULL DEFAULT true;
