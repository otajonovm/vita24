ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "role" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "before" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "after" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;

UPDATE "AuditLog" SET "userId" = "actorId" WHERE "userId" IS NULL AND "actorId" IS NOT NULL;

CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_entityType_createdAt_idx" ON "AuditLog"("entityType", "createdAt");
