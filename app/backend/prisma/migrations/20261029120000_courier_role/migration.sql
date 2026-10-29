-- Courier role and delivery handover. New enum value is not inserted in this migration.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COURIER';

CREATE TYPE "CourierStage" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED');
CREATE TYPE "DeliveryProofMethod" AS ENUM ('CASH', 'CARD_TERMINAL', 'PREPAID');
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

ALTER TABLE "ShopSetting" ADD COLUMN "cardTerminalEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Order" ADD COLUMN "courierId" TEXT,
ADD COLUMN "courierStage" "CourierStage" NOT NULL DEFAULT 'UNASSIGNED',
ADD COLUMN "assignedAt" TIMESTAMP(3),
ADD COLUMN "pickedUpAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveryFailReason" TEXT;

CREATE INDEX "Order_courierId_courierStage_idx" ON "Order"("courierId", "courierStage");

ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CourierBranch" (
    "courierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourierBranch_pkey" PRIMARY KEY ("courierId","branchId")
);

CREATE INDEX "CourierBranch_branchId_idx" ON "CourierBranch"("branchId");

ALTER TABLE "CourierBranch" ADD CONSTRAINT "CourierBranch_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourierBranch" ADD CONSTRAINT "CourierBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "method" "DeliveryProofMethod" NOT NULL,
    "collectedAmount" DECIMAL(12,2),
    "receiptGiven" BOOLEAN NOT NULL DEFAULT false,
    "photoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryProof_orderId_idx" ON "DeliveryProof"("orderId");
CREATE INDEX "DeliveryProof_courierId_createdAt_idx" ON "DeliveryProof"("courierId", "createdAt");

ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "orderIds" TEXT[],
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashHandover_branchId_status_idx" ON "CashHandover"("branchId", "status");
CREATE INDEX "CashHandover_courierId_createdAt_idx" ON "CashHandover"("courierId", "createdAt");

ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
