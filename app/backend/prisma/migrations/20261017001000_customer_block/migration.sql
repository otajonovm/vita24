ALTER TABLE "User" ADD COLUMN "blockReason" TEXT;
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);

CREATE TABLE "CustomerBlockEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBlockEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerBlockEvent_userId_createdAt_idx" ON "CustomerBlockEvent"("userId", "createdAt");

ALTER TABLE "CustomerBlockEvent" ADD CONSTRAINT "CustomerBlockEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
