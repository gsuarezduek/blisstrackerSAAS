-- Repurpose ContentPiece.copy → designDetails: pasa a ser un brief de diseño interno
-- (WYSIWYG/HTML), NUNCA visible en el portal del cliente. El dato viejo (texto plano del
-- posteo) se conserva ahí, escapado y envuelto en HTML básico para que se vea bien en el
-- nuevo editor. `copy` se recrea vacío como campo simple — ese es el que sigue viajando
-- al portal del cliente (mismo nombre de campo, mismo comportamiento downstream).
ALTER TABLE "ContentPiece" RENAME COLUMN "copy" TO "designDetails";

UPDATE "ContentPiece"
SET "designDetails" = '<p>' || replace(
      replace(
        replace(
          replace(
            replace("designDetails", '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      E'\r\n', '<br>'),
    E'\n', '<br>') || '</p>'
WHERE "designDetails" IS NOT NULL AND "designDetails" <> '';

ALTER TABLE "ContentPiece" ADD COLUMN "copy" TEXT;
