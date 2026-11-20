-- Round 3 Group 5: the assistant in Messages. Additive only.
ALTER TABLE "public"."Message" ADD COLUMN "topic" TEXT;
ALTER TABLE "public"."Message" ADD COLUMN "fromAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Thread" ADD COLUMN "waitingForTeamSince" TIMESTAMP(3);
CREATE INDEX "Thread_kind_waitingForTeamSince_idx" ON "public"."Thread"("kind", "waitingForTeamSince");
