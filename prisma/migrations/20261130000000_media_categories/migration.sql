-- Round 7b, Group 2: profile media in four categories, each item with a short
-- description. Additive only. Existing media moves to the closest category.
ALTER TABLE "public"."Media" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "public"."Media" ADD COLUMN IF NOT EXISTS "description" TEXT;

UPDATE "public"."Media" SET "category" = CASE
  WHEN "type" = 'PHOTO' THEN 'SELF'
  WHEN "type" IN ('VIDEO', 'SELFTAPE') THEN 'VIDEOS'
  ELSE 'OTHER'
END
WHERE "category" IS NULL;
