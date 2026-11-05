-- AlterEnum ReceiptStatus: EXPIRED (PostgreSQL 15+ IF NOT EXISTS; older uchun DO)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ReceiptStatus' AND e.enumlabel = 'EXPIRED'
  ) THEN
    ALTER TYPE "ReceiptStatus" ADD VALUE 'EXPIRED';
  END IF;
END $$;

-- AlterTable Branch: filial darajasida kartaga o'tkazma
ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "cardTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cardTransferNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cardTransferHolder" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cardTransferBank" TEXT NOT NULL DEFAULT '';
