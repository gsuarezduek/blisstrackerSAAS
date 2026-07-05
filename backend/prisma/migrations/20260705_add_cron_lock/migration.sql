-- Lease de exclusión mutua para crons entre instancias (lib/cronLock.js).
CREATE TABLE "CronLock" (
    "name" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "owner" TEXT,
    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("name")
);
