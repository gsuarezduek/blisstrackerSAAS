-- AlterTable: top anuncios individuales por snapshot de ads (JSON)
ALTER TABLE "AdsSnapshot" ADD COLUMN "topAds" TEXT NOT NULL DEFAULT '[]';
