-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastStreet" TEXT;
ALTER TABLE "User" ADD COLUMN "lastApartment" TEXT;
ALTER TABLE "User" ADD COLUMN "lastFloor" TEXT;
ALTER TABLE "User" ADD COLUMN "lastIntercom" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLat" REAL;
ALTER TABLE "User" ADD COLUMN "lastLng" REAL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryLat" REAL;
ALTER TABLE "Order" ADD COLUMN "deliveryLng" REAL;
