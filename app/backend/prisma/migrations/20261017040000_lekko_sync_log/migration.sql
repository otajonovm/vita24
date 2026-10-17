CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "LekkoSyncLog" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "LekkoSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LekkoSyncLog_branchId_startedAt_idx" ON "LekkoSyncLog"("branchId", "startedAt");
CREATE INDEX "LekkoSyncLog_status_startedAt_idx" ON "LekkoSyncLog"("status", "startedAt");

ALTER TABLE "LekkoSyncLog" ADD CONSTRAINT "LekkoSyncLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
