-- AlterTable
ALTER TABLE "BranchStock"
  ALTER COLUMN "price" TYPE DECIMAL(12,2) USING ROUND("price", 2),
  ALTER COLUMN "price" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Order"
  ALTER COLUMN "subtotal" TYPE DECIMAL(12,2) USING ROUND("subtotal", 2);

-- AlterTable
ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(12,2) USING ROUND("unitPrice", 2);

-- AlterTable
ALTER TABLE "PaymentTransaction"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING ROUND("amount", 2);
