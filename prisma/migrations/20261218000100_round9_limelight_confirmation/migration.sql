-- Round 9, group 2: the confirmation email to the person who asks for a
-- Limelight portfolio site. Additive: two columns. Requests made before this
-- release are marked "before_r9" so they never get a late confirmation.
ALTER TABLE "limelight"."LimelightLead" ADD COLUMN IF NOT EXISTS "confirmation" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "limelight"."LimelightLead" ADD COLUMN IF NOT EXISTS "confirmationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "limelight"."LimelightLead" ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3);
UPDATE "limelight"."LimelightLead" SET "confirmation" = 'before_r9' WHERE "confirmation" = 'pending' AND "firstSeenAt" < now();
