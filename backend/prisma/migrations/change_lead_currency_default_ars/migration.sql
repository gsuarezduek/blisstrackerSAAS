-- Cambia el default de Lead.currency de 'USD' a 'ARS'. Solo afecta a nuevos
-- registros que no especifiquen moneda (la app ya siempre la envía explícita);
-- no toca filas existentes.
ALTER TABLE "Lead" ALTER COLUMN "currency" SET DEFAULT 'ARS';
