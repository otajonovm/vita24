CREATE TYPE "DeliveryType" AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'AMOUNT');

ALTER TABLE "Order"
  ADD COLUMN "deliveryType" "DeliveryType" NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 15000,
  ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "promoCode" TEXT;

CREATE TABLE "PromoCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "PromoType" NOT NULL,
  "value" DECIMAL(12,2) NOT NULL,
  "minSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "usageLimit" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
