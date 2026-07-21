-- Límite mensual de scraping de competidores: última vez que se llamó al proveedor (Apify) para esta cuenta.
ALTER TABLE "CompetitorAccount" ADD COLUMN "lastScrapedAt" TIMESTAMP(3);
