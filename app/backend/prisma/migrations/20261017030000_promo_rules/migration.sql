ALTER TABLE "PromoCode" ADD COLUMN "maxDiscount" DECIMAL(12,2);
ALTER TABLE "PromoCode" ADD COLUMN "perUserLimit" INTEGER;
ALTER TABLE "PromoCode" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "PromoCode" ADD COLUMN "allBranches" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PromoCode" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "PromoBranch" (
    "promoId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    CONSTRAINT "PromoBranch_pkey" PRIMARY KEY ("promoId","branchId")
);

CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "discount" DECIMAL(12,2) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoRedemption_orderId_key" ON "PromoRedemption"("orderId");
CREATE INDEX "PromoRedemption_promoId_userId_idx" ON "PromoRedemption"("promoId", "userId");

ALTER TABLE "PromoBranch" ADD CONSTRAINT "PromoBranch_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoBranch" ADD CONSTRAINT "PromoBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
