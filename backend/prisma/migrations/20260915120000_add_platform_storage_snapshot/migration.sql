-- CreateTable
CREATE TABLE "PlatformStorageSnapshot" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "totalBytes" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformStorageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformStorageSnapshot_month_key" ON "PlatformStorageSnapshot"("month");
