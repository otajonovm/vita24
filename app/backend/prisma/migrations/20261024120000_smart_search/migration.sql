CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "Medicine" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "Medicine_searchText_trgm_idx"
  ON "Medicine" USING gin ("searchText" gin_trgm_ops);

DO $$ BEGIN
  CREATE TYPE "SynonymType" AS ENUM ('BRAND', 'INGREDIENT', 'SYMPTOM', 'SPELLING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SearchSynonym" (
  "id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "canonical" TEXT NOT NULL,
  "type" "SynonymType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SearchSynonym_term_canonical_type_key"
  ON "SearchSynonym"("term", "canonical", "type");
CREATE INDEX IF NOT EXISTS "SearchSynonym_term_idx" ON "SearchSynonym"("term");

CREATE TABLE IF NOT EXISTS "SearchLog" (
  "id" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "resultsCount" INTEGER NOT NULL,
  "clickedMedicineId" TEXT,
  "branchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SearchLog_normalized_idx" ON "SearchLog"("normalized");
