ALTER TABLE "OrderStatusHistory" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'status';
ALTER TABLE "StockMovement" ADD COLUMN "beforeCount" INTEGER;
ALTER TABLE "StockMovement" ADD COLUMN "afterCount" INTEGER;
ALTER TABLE "Prescription" ADD COLUMN "rejectReasons" TEXT;
