-- Top 3 publicaciones del mes en Instagram (JSON serializado)
-- Estructura: [{ id, likeCount, commentsCount, imgSrc, permalink, mediaType, caption, timestamp }]
ALTER TABLE "InstagramSnapshot"
  ADD COLUMN "topPosts" TEXT NOT NULL DEFAULT '[]';
