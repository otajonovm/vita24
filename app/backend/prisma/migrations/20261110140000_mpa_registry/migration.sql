-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('AUTO', 'REVIEW', 'CONFIRMED', 'REJECTED', 'NONE');

-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('MANUAL', 'REGISTRY', 'NONE');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "RxSource" ADD VALUE 'REGISTRY';
ALTER TYPE "RxSource" ADD VALUE 'DEFAULT';

-- CreateTable
CREATE TABLE "RegistryDrug" (
    "id" TEXT NOT NULL,
    "mpaId" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mnn" TEXT,
    "dosageForm" TEXT,
    "strength" TEXT,
    "manufacturer" TEXT,
    "country" TEXT,
    "registrationCode" TEXT,
    "atxCode" TEXT,
    "isPrescription" BOOLEAN NOT NULL DEFAULT false,
    "dispensingConditions" TEXT,
    "imgUrls" JSONB,
    "normalizedName" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryDrug_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "registryDrugId" TEXT,
ADD COLUMN "matchScore" DOUBLE PRECISION,
ADD COLUMN "matchStatus" "MatchStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "imageSource" "ImageSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN "imageStatus" "ImageStatus",
ADD COLUMN "registryImageCandidates" JSONB;

-- Backfill: existing uploaded images are treated as MANUAL so sync never overwrites them.
UPDATE "Medicine"
SET "imageSource" = 'MANUAL',
    "imageStatus" = 'APPROVED'
WHERE "imageUrl" IS NOT NULL AND TRIM("imageUrl") <> '';

-- CreateIndex
CREATE UNIQUE INDEX "RegistryDrug_mpaId_key" ON "RegistryDrug"("mpaId");

-- CreateIndex
CREATE INDEX "RegistryDrug_normalizedName_idx" ON "RegistryDrug"("normalizedName");

-- CreateIndex
CREATE INDEX "RegistryDrug_mnn_idx" ON "RegistryDrug"("mnn");

-- CreateIndex
CREATE INDEX "RegistryDrug_isPrescription_idx" ON "RegistryDrug"("isPrescription");

-- CreateIndex
CREATE INDEX "Medicine_matchStatus_idx" ON "Medicine"("matchStatus");

-- CreateIndex
CREATE INDEX "Medicine_imageSource_idx" ON "Medicine"("imageSource");

-- CreateIndex
CREATE INDEX "Medicine_imageStatus_idx" ON "Medicine"("imageStatus");

-- CreateIndex
CREATE INDEX "Medicine_registryDrugId_idx" ON "Medicine"("registryDrugId");

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_registryDrugId_fkey" FOREIGN KEY ("registryDrugId") REFERENCES "RegistryDrug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
