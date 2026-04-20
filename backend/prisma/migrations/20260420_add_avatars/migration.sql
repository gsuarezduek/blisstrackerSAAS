CREATE TABLE "Avatar" (
  "id"        SERIAL       PRIMARY KEY,
  "filename"  TEXT         NOT NULL,
  "label"     TEXT         NOT NULL,
  "order"     INTEGER      NOT NULL DEFAULT 0,
  "active"    BOOLEAN      NOT NULL DEFAULT true,
  "imageData" BYTEA        NOT NULL,
  "mimeType"  TEXT         NOT NULL DEFAULT 'image/png',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Avatar_filename_key" UNIQUE ("filename")
);

CREATE INDEX "Avatar_order_idx" ON "Avatar"("order");
CREATE INDEX "Avatar_active_idx" ON "Avatar"("active");
