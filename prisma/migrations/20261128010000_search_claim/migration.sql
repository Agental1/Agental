-- Round 7 Part C: which n8n execution claimed a search. Additive only.
ALTER TABLE "public"."role_search_requests" ADD COLUMN IF NOT EXISTS "claimedBy" TEXT;
