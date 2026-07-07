-- Orden manual de los juegos/desafíos (asc; a igualdad, createdAt desc).
-- Gestionado desde el panel admin de Gamification.
ALTER TABLE "Game" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
