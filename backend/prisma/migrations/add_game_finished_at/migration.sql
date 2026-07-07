-- Marca temporal de finalización del juego. Define la ventana de "recién finalizado"
-- del botón flotante (independiente de updatedAt, que cambia al editar/reordenar).
ALTER TABLE "Game" ADD COLUMN "finishedAt" TIMESTAMP(3);
