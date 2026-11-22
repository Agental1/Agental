-- Round 7b, Group 3: when an unverified account was told it would be deleted.
-- Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "deletionWarnedAt" TIMESTAMP(3);
