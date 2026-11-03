-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ShopSetting"
  ADD COLUMN IF NOT EXISTS "cardTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cardTransferNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cardTransferHolder" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cardTransferBank" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cardTransferTimeoutMin" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentReceipt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
  "rejectReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentReceipt_orderId_createdAt_idx" ON "PaymentReceipt"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentReceipt_orderId_status_idx" ON "PaymentReceipt"("orderId", "status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentReceipt_orderId_fkey'
  ) THEN
    ALTER TABLE "PaymentReceipt"
      ADD CONSTRAINT "PaymentReceipt_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
