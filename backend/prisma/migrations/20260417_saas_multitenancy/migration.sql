-- ============================================================
-- Migration: SaaS Multi-tenancy
-- Adds Workspace, WorkspaceMember, Subscription models
-- Migrates existing data to workspace "bliss" (id=1)
-- ============================================================

-- ─── 1. NUEVAS TABLAS ────────────────────────────────────────

CREATE TABLE "Workspace" (
  "id"               SERIAL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "slug"             TEXT NOT NULL,
  "timezone"         TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  "status"           TEXT NOT NULL DEFAULT 'trialing',
  "trialEndsAt"      TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

CREATE TABLE "WorkspaceMember" (
  "workspaceId"          INTEGER NOT NULL,
  "userId"               INTEGER NOT NULL,
  "role"                 TEXT NOT NULL DEFAULT 'member',
  "teamRole"             TEXT NOT NULL DEFAULT '',
  "active"               BOOLEAN NOT NULL DEFAULT true,
  "vacationDays"         INTEGER NOT NULL DEFAULT 0,
  "weeklyEmailEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "dailyInsightEnabled"  BOOLEAN NOT NULL DEFAULT true,
  "insightMemoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "taskQualityEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "joinedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("workspaceId", "userId"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id"),
  FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

CREATE TABLE "Subscription" (
  "id"          SERIAL PRIMARY KEY,
  "workspaceId" INTEGER NOT NULL UNIQUE,
  "stripeSubId" TEXT UNIQUE,
  "planName"    TEXT NOT NULL DEFAULT 'pro',
  "status"      TEXT NOT NULL DEFAULT 'trialing',
  "seats"       INTEGER NOT NULL DEFAULT 0,
  "periodStart" TIMESTAMP(3),
  "periodEnd"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
);

-- ─── 2. CREAR WORKSPACE "BLISS" ──────────────────────────────

INSERT INTO "Workspace" ("id", "name", "slug", "timezone", "status", "updatedAt")
VALUES (1, 'Bliss Marketing', 'bliss', 'America/Argentina/Buenos_Aires', 'active', CURRENT_TIMESTAMP);

-- Resetear la secuencia para que el próximo workspace tenga id=2
SELECT setval(pg_get_serial_sequence('"Workspace"', 'id'), 1);

-- ─── 3. AGREGAR workspaceId A TABLAS EXISTENTES ──────────────

-- Project
ALTER TABLE "Project" ADD COLUMN "workspaceId" INTEGER;
UPDATE "Project" SET "workspaceId" = 1;
ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
-- Cambiar unique de name a (workspaceId, name)
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_name_key";
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- UserRole
ALTER TABLE "UserRole" ADD COLUMN "workspaceId" INTEGER;
UPDATE "UserRole" SET "workspaceId" = 1;
ALTER TABLE "UserRole" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_name_key";
CREATE UNIQUE INDEX "UserRole_workspaceId_name_key" ON "UserRole"("workspaceId", "name");
CREATE INDEX "UserRole_workspaceId_idx" ON "UserRole"("workspaceId");

-- Service
ALTER TABLE "Service" ADD COLUMN "workspaceId" INTEGER;
UPDATE "Service" SET "workspaceId" = 1;
ALTER TABLE "Service" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Service" ADD CONSTRAINT "Service_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_name_key";
CREATE UNIQUE INDEX "Service_workspaceId_name_key" ON "Service"("workspaceId", "name");
CREATE INDEX "Service_workspaceId_idx" ON "Service"("workspaceId");

-- RoleExpectation
ALTER TABLE "RoleExpectation" ADD COLUMN "workspaceId" INTEGER;
UPDATE "RoleExpectation" SET "workspaceId" = 1;
ALTER TABLE "RoleExpectation" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "RoleExpectation" ADD CONSTRAINT "RoleExpectation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "RoleExpectation" DROP CONSTRAINT IF EXISTS "RoleExpectation_roleName_key";
CREATE UNIQUE INDEX "RoleExpectation_workspaceId_roleName_key" ON "RoleExpectation"("workspaceId", "roleName");
CREATE INDEX "RoleExpectation_workspaceId_idx" ON "RoleExpectation"("workspaceId");

-- WorkDay
ALTER TABLE "WorkDay" ADD COLUMN "workspaceId" INTEGER;
UPDATE "WorkDay" SET "workspaceId" = 1;
ALTER TABLE "WorkDay" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "WorkDay" DROP CONSTRAINT IF EXISTS "WorkDay_userId_date_key";
CREATE UNIQUE INDEX "WorkDay_userId_workspaceId_date_key" ON "WorkDay"("userId", "workspaceId", "date");
CREATE INDEX "WorkDay_workspaceId_date_idx" ON "WorkDay"("workspaceId", "date");

-- DailyInsight
ALTER TABLE "DailyInsight" ADD COLUMN "workspaceId" INTEGER;
UPDATE "DailyInsight" SET "workspaceId" = 1;
ALTER TABLE "DailyInsight" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "DailyInsight" ADD CONSTRAINT "DailyInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "DailyInsight" DROP CONSTRAINT IF EXISTS "DailyInsight_userId_date_key";
CREATE UNIQUE INDEX "DailyInsight_userId_workspaceId_date_key" ON "DailyInsight"("userId", "workspaceId", "date");
CREATE INDEX "DailyInsight_workspaceId_idx" ON "DailyInsight"("workspaceId");

-- UserInsightMemory
ALTER TABLE "UserInsightMemory" ADD COLUMN "workspaceId" INTEGER;
UPDATE "UserInsightMemory" SET "workspaceId" = 1;
ALTER TABLE "UserInsightMemory" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "UserInsightMemory" ADD CONSTRAINT "UserInsightMemory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
ALTER TABLE "UserInsightMemory" DROP CONSTRAINT IF EXISTS "UserInsightMemory_userId_weekStart_key";
CREATE UNIQUE INDEX "UserInsightMemory_userId_workspaceId_weekStart_key" ON "UserInsightMemory"("userId", "workspaceId", "weekStart");
CREATE INDEX "UserInsightMemory_workspaceId_idx" ON "UserInsightMemory"("workspaceId");

-- AiTokenLog
ALTER TABLE "AiTokenLog" ADD COLUMN "workspaceId" INTEGER;
UPDATE "AiTokenLog" SET "workspaceId" = 1;
ALTER TABLE "AiTokenLog" ADD CONSTRAINT "AiTokenLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
CREATE INDEX "AiTokenLog_workspaceId_idx" ON "AiTokenLog"("workspaceId");

-- Notification
ALTER TABLE "Notification" ADD COLUMN "workspaceId" INTEGER;
UPDATE "Notification" SET "workspaceId" = 1;
ALTER TABLE "Notification" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");

-- UserLogin
ALTER TABLE "UserLogin" ADD COLUMN "workspaceId" INTEGER;
UPDATE "UserLogin" SET "workspaceId" = 1;
ALTER TABLE "UserLogin" ADD CONSTRAINT "UserLogin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");
CREATE INDEX "UserLogin_workspaceId_idx" ON "UserLogin"("workspaceId");

-- Feedback
ALTER TABLE "Feedback" ADD COLUMN "workspaceId" INTEGER;
UPDATE "Feedback" SET "workspaceId" = 1;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id");

-- ─── 4. MIGRAR DATOS DE USER A WorkspaceMember ───────────────

-- Crear un WorkspaceMember por cada usuario existente
-- Migrando: role → teamRole, isAdmin → role (owner/admin/member), active, vacationDays, AI flags
INSERT INTO "WorkspaceMember" (
  "workspaceId", "userId", "role", "teamRole", "active", "vacationDays",
  "weeklyEmailEnabled", "dailyInsightEnabled", "insightMemoryEnabled", "taskQualityEnabled",
  "joinedAt"
)
SELECT
  1,
  u."id",
  CASE WHEN u."isAdmin" = true THEN 'admin' ELSE 'member' END,
  COALESCE(u."role", ''),
  u."active",
  COALESCE(u."vacationDays", 0),
  u."weeklyEmailEnabled",
  u."dailyInsightEnabled",
  u."insightMemoryEnabled",
  u."taskQualityEnabled",
  u."createdAt"
FROM "User" u;

-- ─── 5. LIMPIAR COLUMNAS WORKSPACE-SPECIFIC DE USER ─────────

ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
ALTER TABLE "User" DROP COLUMN IF EXISTS "active";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isAdmin";
ALTER TABLE "User" DROP COLUMN IF EXISTS "vacationDays";
ALTER TABLE "User" DROP COLUMN IF EXISTS "weeklyEmailEnabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyInsightEnabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "insightMemoryEnabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "taskQualityEnabled";

-- Agregar isSuperAdmin
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
