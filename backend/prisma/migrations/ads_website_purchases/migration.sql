-- Meta Ads: compras en el sitio web (evento Purchase del píxel) en el snapshot mensual,
-- para mostrarlas en el historial y medir el objetivo "Ventas en el sitio web".
ALTER TABLE "AdsSnapshot" ADD COLUMN "websitePurchases" INTEGER;
ALTER TABLE "AdsSnapshot" ADD COLUMN "websitePurchaseValue" DOUBLE PRECISION;
