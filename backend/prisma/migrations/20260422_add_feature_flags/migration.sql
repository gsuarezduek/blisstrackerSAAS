CREATE TABLE "FeatureFlag" (
  "id"                  SERIAL       PRIMARY KEY,
  "key"                 TEXT         NOT NULL,
  "name"                TEXT         NOT NULL,
  "description"         TEXT         NOT NULL DEFAULT '',
  "enabledGlobally"     BOOLEAN      NOT NULL DEFAULT false,
  "enabledWorkspaceIds" TEXT         NOT NULL DEFAULT '[]',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureFlag_key_key" UNIQUE ("key")
);

CREATE INDEX "FeatureFlag_key_idx" ON "FeatureFlag"("key");
