-- Mensajes del sistema en el chat: authorId pasa a opcional (null = mensaje del sistema,
-- sin autor humano) y se agrega systemType para identificar el tipo de evento
-- (informe generado, brief completo, reunión cerrada, etc. — catálogo en
-- backend/src/lib/chatSystemMessage.js). El FK de authorId ya soporta NULL sin tocar
-- su ON DELETE CASCADE (solo aplica a filas con authorId no nulo).
ALTER TABLE "ChatMessage" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "systemType" TEXT;
