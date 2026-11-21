-- Round 4 Group B. Additive only: one nullable column.
-- Start of the user's current 30-day AI search period (set by their first
-- search, renewed by the first search after it ends).
ALTER TABLE "public"."User" ADD COLUMN "searchPeriodStartedAt" TIMESTAMP(3);
