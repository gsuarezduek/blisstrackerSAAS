-- Índices compuestos que faltaban para queries calientes de dashboards/reportes.

-- Task: patrón "status='COMPLETED' + completedAt range" repetido en
-- productivityStats.service.js, reports.controller.js (byProject/mine) y
-- eosAutoScorecard.service.js (métrica tareas_completadas).
CREATE INDEX "Task_status_completedAt_idx" ON "Task"("status", "completedAt");

-- UserLogin: patrón "workspaceId + loginAt range" repetido en RRHH, Productividad,
-- rrhhMetricSnapshot.service.js y lateNotification.service.js.
CREATE INDEX "UserLogin_workspaceId_loginAt_idx" ON "UserLogin"("workspaceId", "loginAt");
