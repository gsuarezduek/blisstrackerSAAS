-- RRHH pasa a ser un módulo real (feature flag "rrhh" + Workspace.moduleAccess) y se agregan:
-- acumulación automática de vacaciones (regla única global, ancla en el aniversario de
-- ingreso de cada persona) + 2 bancos de beneficios nuevos ("horas_libres"/"dias_home").

-- AlterTable: Workspace — regla única global de acumulación de vacaciones
ALTER TABLE "Workspace" ADD COLUMN "vacationAccrualEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN "vacationAccrualDays" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Workspace" ADD COLUMN "vacationAccrualIntervalMonths" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Workspace" ADD COLUMN "vacationAccrualActivatedAt" TIMESTAMP(3);

-- AlterTable: WorkspaceMember — puntero de acumulación + saldos de los 2 bancos nuevos
ALTER TABLE "WorkspaceMember" ADD COLUMN "nextVacationAccrualAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN "freeHoursBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "WorkspaceMember" ADD COLUMN "homeDaysBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: VacationAdjustment.adminId pasa a nullable — un ajuste automático (acumulación
-- por cron) no tiene un admin humano detrás.
ALTER TABLE "VacationAdjustment" ALTER COLUMN "adminId" DROP NOT NULL;

-- AlterEnum: los ADD VALUE van solos, sin ningún statement que los consuma en la misma
-- transacción (mismo patrón que el resto de las migraciones de NotificationType).
ALTER TYPE "NotificationType" ADD VALUE 'BENEFIT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'BENEFIT_REVIEWED';

-- CreateTable
CREATE TABLE "BenefitBankAdjustment" (
    "id"          SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId"      INTEGER NOT NULL,
    "bank"        TEXT NOT NULL,
    "adminId"     INTEGER,
    "prevBalance" DOUBLE PRECISION NOT NULL,
    "newBalance"  DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitBankAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitBankRequest" (
    "id"           SERIAL NOT NULL,
    "workspaceId"  INTEGER NOT NULL,
    "userId"       INTEGER NOT NULL,
    "bank"         TEXT NOT NULL,
    "amount"       DOUBLE PRECISION NOT NULL,
    "date"         TEXT,
    "reason"       TEXT,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" INTEGER,
    "reviewedAt"   TIMESTAMP(3),
    "reviewNote"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitBankRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BenefitBankAdjustment" ADD CONSTRAINT "BenefitBankAdjustment_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitBankAdjustment" ADD CONSTRAINT "BenefitBankAdjustment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitBankAdjustment" ADD CONSTRAINT "BenefitBankAdjustment_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BenefitBankRequest" ADD CONSTRAINT "BenefitBankRequest_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitBankRequest" ADD CONSTRAINT "BenefitBankRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenefitBankRequest" ADD CONSTRAINT "BenefitBankRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BenefitBankAdjustment_workspaceId_userId_bank_idx" ON "BenefitBankAdjustment"("workspaceId", "userId", "bank");
CREATE INDEX "BenefitBankRequest_workspaceId_userId_bank_idx" ON "BenefitBankRequest"("workspaceId", "userId", "bank");
CREATE INDEX "BenefitBankRequest_workspaceId_status_idx" ON "BenefitBankRequest"("workspaceId", "status");

-- Seed del feature flag "rrhh" con enabledGlobally=true — evita cortarle el acceso a todos
-- los workspaces existentes, que hoy usan RRHH/Vacaciones sin ningún flag. El upsert de
-- arranque (index.js) solo actualiza name/description si la fila ya existe y nunca pisa
-- enabledGlobally, así que sembrarlo acá es lo único que garantiza cero regresión al desplegar.
INSERT INTO "FeatureFlag" ("key", "name", "description", "enabledGlobally", "enabledWorkspaceIds", "createdAt", "updatedAt")
VALUES ('rrhh', 'Sección RRHH', 'Panel de RRHH: legajos, ingresos, licencias, vacaciones, beneficios y productividad.', true, '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
