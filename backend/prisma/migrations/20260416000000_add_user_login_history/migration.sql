CREATE TABLE "UserLogin" (
    "id"      SERIAL PRIMARY KEY,
    "userId"  INTEGER NOT NULL,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method"  TEXT NOT NULL,
    CONSTRAINT "UserLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UserLogin_userId_idx"  ON "UserLogin"("userId");
CREATE INDEX "UserLogin_loginAt_idx" ON "UserLogin"("loginAt");
