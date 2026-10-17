CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'DONE');

ALTER TABLE "Branch" ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Order" ADD COLUMN "pharmacistNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Order" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "branchStockId" TEXT NOT NULL,
    "userId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
CREATE INDEX "StockMovement_branchStockId_createdAt_idx" ON "StockMovement"("branchStockId", "createdAt");

ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchStockId_fkey" FOREIGN KEY ("branchStockId") REFERENCES "BranchStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
