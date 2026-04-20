-- CreateTable Announcement
CREATE TABLE "Announcement" (
    "id"                 SERIAL NOT NULL,
    "title"              TEXT NOT NULL,
    "body"               TEXT NOT NULL,
    "type"               TEXT NOT NULL DEFAULT 'info',
    "targetAll"          BOOLEAN NOT NULL DEFAULT true,
    "targetWorkspaceIds" TEXT NOT NULL DEFAULT '[]',
    "active"             BOOLEAN NOT NULL DEFAULT false,
    "startsAt"           TIMESTAMP(3),
    "endsAt"             TIMESTAMP(3),
    "createdById"        INTEGER NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Announcement_active_idx" ON "Announcement"("active");
