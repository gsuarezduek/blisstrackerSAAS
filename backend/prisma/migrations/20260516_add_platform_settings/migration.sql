-- CreateTable: PlatformSetting (key/value JSON para configuración global del SaaS)
CREATE TABLE "PlatformSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateTable: PlatformSettingLog (audit log de cambios)
CREATE TABLE "PlatformSettingLog" (
    "id" SERIAL NOT NULL,
    "settingKey" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettingLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformSettingLog_settingKey_createdAt_idx" ON "PlatformSettingLog"("settingKey", "createdAt");

ALTER TABLE "PlatformSettingLog"
    ADD CONSTRAINT "PlatformSettingLog_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
