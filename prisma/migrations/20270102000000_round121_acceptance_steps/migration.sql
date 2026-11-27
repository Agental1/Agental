-- Round 12.1, group 2: the representation step and the plans step are recorded
-- on their own, apart from the Privacy Policy acceptance. Additive only: new
-- nullable columns on "User" (which already has row level security).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "representationAckAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "representationAckVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plansStepAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plansStepVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plansStepChoice" TEXT;
