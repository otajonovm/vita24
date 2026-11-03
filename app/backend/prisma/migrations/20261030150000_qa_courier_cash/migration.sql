-- Courier cash, handover links, refresh tokens, localized catalog names.

ALTER TABLE "CourierBranch" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Category" ADD COLUMN "nameUz" TEXT;
ALTER TABLE "Category" ADD COLUMN "nameUzCyrl" TEXT;
ALTER TABLE "Category" ADD COLUMN "nameRu" TEXT;
UPDATE "Category" SET "nameUz" = "name" WHERE "nameUz" IS NULL;

ALTER TABLE "Medicine" ADD COLUMN "hiddenFromShowcase" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Medicine"
SET "hiddenFromShowcase" = true, "showOnHome" = false
WHERE name ~* 'kma-dfg'
   OR name ~* '^l[[:space:]]'
   OR name ~ '^[a-z0-9]{1,4}-';

ALTER TABLE "DeliveryProof" ADD COLUMN "discrepancy" DECIMAL(12,2);
ALTER TABLE "DeliveryProof" ADD COLUMN "discrepancyReason" TEXT;
ALTER TABLE "DeliveryProof" ADD COLUMN "discrepancyOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryProof" ADD COLUMN "terminalRef" TEXT;
ALTER TABLE "DeliveryProof" ADD COLUMN "handoverId" TEXT;

CREATE INDEX "DeliveryProof_handoverId_idx" ON "DeliveryProof"("handoverId");

CREATE TABLE "CashHandoverOrder" (
    "handoverId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    CONSTRAINT "CashHandoverOrder_pkey" PRIMARY KEY ("handoverId","orderId")
);

CREATE INDEX "CashHandoverOrder_orderId_idx" ON "CashHandoverOrder"("orderId");

INSERT INTO "CashHandoverOrder" ("handoverId", "orderId")
SELECT h."id", oid
FROM "CashHandover" h
CROSS JOIN LATERAL unnest(h."orderIds") AS oid
ON CONFLICT DO NOTHING;

ALTER TABLE "CashHandoverOrder" ADD CONSTRAINT "CashHandoverOrder_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CashHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashHandoverOrder" ADD CONSTRAINT "CashHandoverOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CashHandover"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CashHandover_courier_pending_key" ON "CashHandover"("courierId") WHERE "status" = 'PENDING';

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopSetting" ADD COLUMN "localizedCopy" JSONB NOT NULL DEFAULT '{}';
