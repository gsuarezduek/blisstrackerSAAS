-- Motor de reglas de reactivación de WhatsApp (extiende la Fase 5 del plan):
-- reglas configurables por workspace (trigger + umbral de días + filtros de
-- estado/origen + plantilla) evaluadas por un cron diario, con un log de
-- auditoría/cooldown para no re-disparar la misma regla sobre el mismo lead.

-- CreateTable
CREATE TABLE "WhatsappAutomationRule" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "triggerDays" INTEGER NOT NULL,
    "statusFilter" TEXT,
    "originFilter" TEXT,
    "templateId" INTEGER NOT NULL,
    "variableMapping" TEXT,
    "cooldownDays" INTEGER NOT NULL DEFAULT 14,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappAutomationLog" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappAutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappAutomationRule_workspaceId_active_idx" ON "WhatsappAutomationRule"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "WhatsappAutomationLog_ruleId_leadId_createdAt_idx" ON "WhatsappAutomationLog"("ruleId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappAutomationLog_workspaceId_createdAt_idx" ON "WhatsappAutomationLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappAutomationRule" ADD CONSTRAINT "WhatsappAutomationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAutomationRule" ADD CONSTRAINT "WhatsappAutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsappTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAutomationRule" ADD CONSTRAINT "WhatsappAutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAutomationLog" ADD CONSTRAINT "WhatsappAutomationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAutomationLog" ADD CONSTRAINT "WhatsappAutomationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WhatsappAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappAutomationLog" ADD CONSTRAINT "WhatsappAutomationLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
