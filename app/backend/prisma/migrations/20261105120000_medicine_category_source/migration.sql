-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('AUTO', 'MANUAL', 'IMPORT');

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "categorySource" "CategorySource" NOT NULL DEFAULT 'AUTO';

-- CreateIndex
CREATE INDEX "Medicine_categorySource_idx" ON "Medicine"("categorySource");

-- CreateIndex
CREATE INDEX "Medicine_categoryId_idx" ON "Medicine"("categoryId");
