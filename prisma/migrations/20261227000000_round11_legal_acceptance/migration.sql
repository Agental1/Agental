-- Round 11, group 3 (founder): which Privacy Policy (and later Terms of
-- Service) version each account accepted, and when. Additive: four nullable
-- columns, no data written. Accounts without a value accept once at their next
-- sign-in.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
