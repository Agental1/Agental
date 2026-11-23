-- Round 9, group 1: account cleanup with a 30-day safety net. Additive only.
-- An admin's "Delete" sets deletedAt (sign-in refused, sessions ended, agents
-- off); the account can be restored for 30 days, then it is purged with its
-- files. lastSignInAt feeds the "last sign-in" filter (null before round 9).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedPrevStatus" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSignInAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User" ("deletedAt");
