DO $$ BEGIN
  CREATE TYPE "RxSource" AS ENUM ('LEKKO', 'RULE', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "rxSource" "RxSource";
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "atcCode" TEXT;
ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "rxNeedsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Medicine_isPrescription_idx" ON "Medicine"("isPrescription");
CREATE INDEX IF NOT EXISTS "Medicine_rxSource_idx" ON "Medicine"("rxSource");
CREATE INDEX IF NOT EXISTS "Medicine_rxNeedsReview_idx" ON "Medicine"("rxNeedsReview");
