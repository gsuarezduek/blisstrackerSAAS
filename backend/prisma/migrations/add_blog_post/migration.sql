-- Blog público (BlogPost) — editable desde SuperAdmin → Blog, servido sin auth en /api/public/blog*
CREATE TABLE "BlogPost" (
    "id"                 SERIAL NOT NULL,
    "slug"               TEXT NOT NULL,
    "title"              TEXT NOT NULL,
    "excerpt"            TEXT NOT NULL DEFAULT '',
    "contentHtml"        TEXT NOT NULL DEFAULT '',
    "coverImageData"     BYTEA,
    "coverImageMimeType" TEXT,
    "status"             TEXT NOT NULL DEFAULT 'draft',
    "publishedAt"        TIMESTAMP(3),
    "metaTitle"          TEXT,
    "metaDescription"    TEXT,
    "authorName"         TEXT NOT NULL DEFAULT 'Equipo BlissTracker',
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
