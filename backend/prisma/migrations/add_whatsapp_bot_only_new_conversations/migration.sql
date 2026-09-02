-- El bot, si está prendido, respondía siempre en una conversación (con
-- takeover manual como única forma de frenarlo). Este flag deja que un
-- workspace lo restrinja a solo conversaciones donde todavía nadie (ni
-- humano ni el bot) mandó una respuesta.

-- AlterTable
ALTER TABLE "WhatsappBotConfig" ADD COLUMN "onlyNewConversations" BOOLEAN NOT NULL DEFAULT false;
