-- Round 8, group 2: when a profile first reached 100% under the round 8 rule,
-- so the celebration shows once. Additive: one nullable column, no backfill
-- (profiles complete under the old rule celebrate when they meet the new one).
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "profileCompletedAt" TIMESTAMP(3);
