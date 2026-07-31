-- onDelete: Cascade explícito en 12 relaciones workspace-scoped que dependían de
-- Restrict/NO ACTION implícito. Hasta ahora, borrar un Workspace solo funcionaba
-- porque executeWorkspaceDeletion (workspace.controller.js) borra estas filas a
-- mano en un orden específico ANTES de prisma.workspace.delete() — un script de
-- mantenimiento, un test, o un futuro cambio de ese orden rompía el borrado.
-- Con Cascade a nivel de DB, la integridad ya no depende de que el código
-- recuerde el orden correcto.

ALTER TABLE "WorkspaceMember" DROP CONSTRAINT "WorkspaceMember_workspaceId_fkey";
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_workspaceId_fkey";
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_workspaceId_fkey";
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" DROP CONSTRAINT "Project_workspaceId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service" DROP CONSTRAINT "Service_workspaceId_fkey";
ALTER TABLE "Service" ADD CONSTRAINT "Service_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleExpectation" DROP CONSTRAINT "RoleExpectation_workspaceId_fkey";
ALTER TABLE "RoleExpectation" ADD CONSTRAINT "RoleExpectation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceInvitation" DROP CONSTRAINT "WorkspaceInvitation_workspaceId_fkey";
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeoAudit" DROP CONSTRAINT "GeoAudit_workspaceId_fkey";
ALTER TABLE "GeoAudit" ADD CONSTRAINT "GeoAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectIntegration" DROP CONSTRAINT "ProjectIntegration_workspaceId_fkey";
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsSnapshot" DROP CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey";
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsInsight" DROP CONSTRAINT "AnalyticsInsight_workspaceId_fkey";
ALTER TABLE "AnalyticsInsight" ADD CONSTRAINT "AnalyticsInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageSpeedResult" DROP CONSTRAINT "PageSpeedResult_workspaceId_fkey";
ALTER TABLE "PageSpeedResult" ADD CONSTRAINT "PageSpeedResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
