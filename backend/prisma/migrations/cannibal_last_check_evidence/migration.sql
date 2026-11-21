-- Por qué la última verificación de una resolución NO reabrió el conflicto.
-- Sin esto, "no reabre" era silencio: un conflicto oculto para siempre por una
-- resolución que la verificación nunca pudo evaluar (días de datos insuficientes,
-- volumen por debajo del piso prorrateado, o el filtro de idioma descartando todas
-- las filas porque la resolución se guardó con otro idioma y sin urls) se leía igual
-- que uno legítimamente resuelto.
ALTER TABLE "CannibalResolution" ADD COLUMN "lastCheckEvidence" TEXT;
