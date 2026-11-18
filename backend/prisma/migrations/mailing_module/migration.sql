-- CreateTable
CREATE TABLE "MailingConfig" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "credentials" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "postalAddress" TEXT,
    "brandColor" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500,
    "sendWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '20:00',
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "webhookToken" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "webhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingContact" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'subscribed',
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribeReason" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "crmContactId" INTEGER,
    "confirmToken" TEXT,
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingList" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "doubleOptIn" BOOLEAN NOT NULL DEFAULT true,
    "publicFormToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingListMember" (
    "id" SERIAL NOT NULL,
    "listId" INTEGER NOT NULL,
    "contactId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailingListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingCampaign" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "preheader" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "html" TEXT,
    "text" TEXT,
    "includeListIds" JSONB NOT NULL DEFAULT '[]',
    "excludeListIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribeCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdByAgentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingSend" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "contactId" INTEGER,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "errorMsg" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "firstOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedAt" TIMESTAMP(3),
    "bounceType" TEXT,
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailingSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingLink" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "idx" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MailingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingClick" (
    "id" SERIAL NOT NULL,
    "sendId" INTEGER NOT NULL,
    "linkId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailingClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailingDailyUsage" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MailingDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailingConfig_projectId_key" ON "MailingConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingConfig_webhookToken_key" ON "MailingConfig"("webhookToken");

-- CreateIndex
CREATE INDEX "MailingConfig_workspaceId_idx" ON "MailingConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingContact_confirmToken_key" ON "MailingContact"("confirmToken");

-- CreateIndex
CREATE INDEX "MailingContact_projectId_status_idx" ON "MailingContact"("projectId", "status");

-- CreateIndex
CREATE INDEX "MailingContact_workspaceId_idx" ON "MailingContact"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingContact_projectId_email_key" ON "MailingContact"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MailingList_publicFormToken_key" ON "MailingList"("publicFormToken");

-- CreateIndex
CREATE INDEX "MailingList_workspaceId_idx" ON "MailingList"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingList_projectId_name_key" ON "MailingList"("projectId", "name");

-- CreateIndex
CREATE INDEX "MailingListMember_contactId_idx" ON "MailingListMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingListMember_listId_contactId_key" ON "MailingListMember"("listId", "contactId");

-- CreateIndex
CREATE INDEX "MailingCampaign_projectId_status_idx" ON "MailingCampaign"("projectId", "status");

-- CreateIndex
CREATE INDEX "MailingCampaign_status_scheduledAt_idx" ON "MailingCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MailingCampaign_workspaceId_idx" ON "MailingCampaign"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingSend_token_key" ON "MailingSend"("token");

-- CreateIndex
CREATE INDEX "MailingSend_campaignId_status_idx" ON "MailingSend"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MailingSend_projectId_status_idx" ON "MailingSend"("projectId", "status");

-- CreateIndex
CREATE INDEX "MailingSend_status_nextAttemptAt_idx" ON "MailingSend"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MailingSend_providerMessageId_idx" ON "MailingSend"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingLink_campaignId_idx_key" ON "MailingLink"("campaignId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "MailingClick_sendId_linkId_key" ON "MailingClick"("sendId", "linkId");

-- CreateIndex
CREATE UNIQUE INDEX "MailingDailyUsage_projectId_date_key" ON "MailingDailyUsage"("projectId", "date");

-- AddForeignKey
ALTER TABLE "MailingConfig" ADD CONSTRAINT "MailingConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingConfig" ADD CONSTRAINT "MailingConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingContact" ADD CONSTRAINT "MailingContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingContact" ADD CONSTRAINT "MailingContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingContact" ADD CONSTRAINT "MailingContact_crmContactId_fkey" FOREIGN KEY ("crmContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingList" ADD CONSTRAINT "MailingList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingList" ADD CONSTRAINT "MailingList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingListMember" ADD CONSTRAINT "MailingListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MailingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingListMember" ADD CONSTRAINT "MailingListMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MailingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingCampaign" ADD CONSTRAINT "MailingCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingCampaign" ADD CONSTRAINT "MailingCampaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingCampaign" ADD CONSTRAINT "MailingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingCampaign" ADD CONSTRAINT "MailingCampaign_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingSend" ADD CONSTRAINT "MailingSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingSend" ADD CONSTRAINT "MailingSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MailingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingLink" ADD CONSTRAINT "MailingLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingClick" ADD CONSTRAINT "MailingClick_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MailingSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingClick" ADD CONSTRAINT "MailingClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MailingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailingDailyUsage" ADD CONSTRAINT "MailingDailyUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

