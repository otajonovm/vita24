ALTER TABLE "Medicine" ADD COLUMN "dosage" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "activeIngredient" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "usage" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "contraindications" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "storageConditions" TEXT;

CREATE INDEX "Medicine_activeIngredient_idx" ON "Medicine"("activeIngredient");

UPDATE "Medicine" SET
  "dosage" = '500 mg',
  "activeIngredient" = 'Paracetamol',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-paracetamol';

UPDATE "Medicine" SET
  "dosage" = '400 mg',
  "activeIngredient" = 'Ibuprofen',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-ibuprofen';

UPDATE "Medicine" SET
  "dosage" = '500 mg',
  "activeIngredient" = 'Amoksitsillin',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-amoxicillin';

UPDATE "Medicine" SET
  "dosage" = '500 mg',
  "activeIngredient" = 'Azitromitsin',
  "quantityInPack" = 3,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-azithromycin';

UPDATE "Medicine" SET
  "dosage" = '500 mg',
  "activeIngredient" = 'Tsiprofloksatsin',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-ciprofloxacin';

UPDATE "Medicine" SET
  "dosage" = '100 mg',
  "activeIngredient" = 'Atsetilsalitsil kislota',
  "quantityInPack" = 30,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-aspirin';

UPDATE "Medicine" SET
  "dosage" = '10 mg',
  "activeIngredient" = 'Enalapril',
  "quantityInPack" = 20,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-enalapril';

UPDATE "Medicine" SET
  "dosage" = '1000 mg',
  "activeIngredient" = 'Askorbin kislota',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-vitaminc';

UPDATE "Medicine" SET
  "dosage" = '2000 IU',
  "activeIngredient" = 'Kolekalsiferol',
  "quantityInPack" = 30,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-vitamind';

UPDATE "Medicine" SET
  "dosage" = '100 mg/5 ml',
  "activeIngredient" = 'Ibuprofen',
  "quantityInPack" = 1,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-nurofen';

UPDATE "Medicine" SET
  "dosage" = '120 mg/5 ml',
  "activeIngredient" = 'Paracetamol',
  "quantityInPack" = 1,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-panadol';

UPDATE "Medicine" SET
  "dosage" = '10 mg',
  "activeIngredient" = 'Loratadin',
  "quantityInPack" = 10,
  "usage" = "description",
  "storageConditions" = 'Quruq, yorug''likdan himoyalangan joyda, 25°C dan past saqlang'
WHERE "id" = 'med-loratadine';
