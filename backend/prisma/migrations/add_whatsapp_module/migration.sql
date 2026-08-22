-- CreateTable
CREATE TABLE "WhatsappAccount" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'chakra',
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "pluginId" TEXT,
    "accessToken" TEXT,
    "webhookSecret" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connectedById" INTEGER,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "contactName" TEXT,
    "contactId" INTEGER,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "content" TEXT,
    "mediaUrl" TEXT,
    "waMessageId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderUserId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConversationRead" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastReadMessageId" INTEGER,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappConversationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappAccount_workspaceId_idx" ON "WhatsappAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappAccount_workspaceId_phoneNumberId_key" ON "WhatsappAccount"("workspaceId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_lastMessageAt_idx" ON "WhatsappConversation"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_contactId_idx" ON "WhatsappConversation"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_workspaceId_phoneE164_key" ON "WhatsappConversation"("workspaceId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_waMessageId_key" ON "WhatsappMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_createdAt_idx" ON "WhatsappMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_workspaceId_idx" ON "WhatsappMessage"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversationRead_conversationId_userId_key" ON "WhatsappConversationRead"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "WhatsappAccount" ADD CONSTRAINT "WhatsappAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAccount" ADD CONSTRAINT "WhatsappAccount_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsappAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversationRead" ADD CONSTRAINT "WhatsappConversationRead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversationRead" ADD CONSTRAINT "WhatsappConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversationRead" ADD CONSTRAINT "WhatsappConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
