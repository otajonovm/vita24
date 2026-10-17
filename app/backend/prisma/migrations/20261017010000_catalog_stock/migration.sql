ALTER TABLE "Branch" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Medicine" ADD COLUMN "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Medicine" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Medicine" m
SET "basePrice" = sub.price
FROM (
  SELECT DISTINCT ON ("medicineId") "medicineId", price
  FROM "BranchStock"
  WHERE price > 0
  ORDER BY "medicineId", price ASC
) sub
WHERE m.id = sub."medicineId";
