-- CreateTable
CREATE TABLE "LandingContent" (
    "id" SERIAL NOT NULL,
    "heroBadge" TEXT NOT NULL DEFAULT 'Hecho para agencias de marketing · Gratis hasta 3 usuarios',
    "heroTitle" TEXT NOT NULL DEFAULT 'El sistema operativo',
    "heroTitleAccent" TEXT NOT NULL DEFAULT 'de tu agencia.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Tareas con foco real, visibilidad de tu equipo en vivo, e informes automáticos — más los módulos que tu agencia necesite: marketing, EOS, ventas.',
    "demoVideoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedCompany" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "imageData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrustedCompany_order_idx" ON "TrustedCompany"("order");

-- CreateIndex
CREATE INDEX "TrustedCompany_active_idx" ON "TrustedCompany"("active");
