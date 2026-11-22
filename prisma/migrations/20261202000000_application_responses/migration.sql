-- Round 7b, Group 4.2: answering a role from Applications. Additive only.
-- What a role asks for (questions, videos), the performer's answers, and when
-- the role was accepted and the response submitted for the team's review.
ALTER TABLE "public"."Brief" ADD COLUMN IF NOT EXISTS "submission" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "answers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "public"."DraftMedia" ADD COLUMN IF NOT EXISTS "slot" INTEGER;
