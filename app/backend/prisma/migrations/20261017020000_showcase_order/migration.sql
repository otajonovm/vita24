ALTER TABLE "Medicine" ADD COLUMN "homeSortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) AS n
  FROM "Medicine"
  WHERE "showOnHome" = true
)
UPDATE "Medicine" AS m
SET "homeSortOrder" = ranked.n
FROM ranked
WHERE m.id = ranked.id;

CREATE INDEX "Medicine_showOnHome_homeSortOrder_idx" ON "Medicine"("showOnHome", "homeSortOrder");
