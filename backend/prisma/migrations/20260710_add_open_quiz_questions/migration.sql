-- Preguntas abiertas en cuestionarios: discriminador de tipo + respuesta correcta opcional.
ALTER TABLE "GameQuestion" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'multiple_choice';
ALTER TABLE "GameQuestion" ALTER COLUMN "correctOptionId" DROP NOT NULL;
