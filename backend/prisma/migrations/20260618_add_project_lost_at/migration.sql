-- Fecha de baja de un proyecto: se setea cuando pasa de activo a inactivo (active true→false)
-- y se limpia al reactivarlo. Alimenta la métrica automática "Proyectos perdidos" del Scorecard EOS.
-- Va hacia adelante: las bajas previas a esta migración quedan sin fecha (no se cuentan).
ALTER TABLE "Project" ADD COLUMN "lostAt" TIMESTAMP(3);
