-- Round 7b, Group 1: the policy version a cookie choice was made under, and the
-- notification preferences of Settings. Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyApplications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyProduct" BOOLEAN NOT NULL DEFAULT false;
