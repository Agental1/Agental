-- Round 8b, group 3: searches run at most one every 6 hours per performer.
-- Each queued search gets the time it may start; the app's claim skips a
-- search before that time. Additive: one nullable column (older rows keep
-- NULL and may start at once, as before).
ALTER TABLE "public"."role_search_requests" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
