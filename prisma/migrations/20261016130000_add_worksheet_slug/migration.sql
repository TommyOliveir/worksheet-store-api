-- Added nullable first so existing rows can be backfilled before the
-- NOT NULL and UNIQUE constraints are applied.
ALTER TABLE "Worksheet" ADD COLUMN "slug" TEXT;

-- Backfill from title; duplicate slugs get a short id suffix so the
-- unique index below can be created.
UPDATE "Worksheet" w
SET "slug" = candidate.slug
FROM (
  SELECT
    id,
    base
      || CASE
           WHEN ROW_NUMBER() OVER (PARTITION BY base ORDER BY "createdAt", id) > 1
           THEN '-' || SUBSTRING(id::text, 1, 8)
           ELSE ''
         END AS slug
  FROM (
    SELECT
      id,
      "createdAt",
      COALESCE(
        NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g')), ''),
        'worksheet'
      ) AS base
    FROM "Worksheet"
  ) normalized
) candidate
WHERE w.id = candidate.id;

ALTER TABLE "Worksheet" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Worksheet_slug_key" ON "Worksheet"("slug");
