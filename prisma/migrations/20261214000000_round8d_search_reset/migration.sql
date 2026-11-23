-- Round 8d, group 2 (founders' request, 2026-11-22). Additive: one column,
-- no row deleted.
--
-- 1. A quota reset date per account: searches queued before it no longer
--    count against the allowance. Every account is reset today, so everyone
--    starts again with their plan's full allowance. The period start is
--    cleared, so the next search opens a new 30-day period (code from before
--    this release reads that as "nothing used" too). Searches that were still
--    waiting in the queue (none ever ran: n8n is not connected) are marked
--    canceled with a note, so the fresh start has an empty queue; their rows
--    stay.
-- 2. The founder's own account becomes a Test account, so it can run searches
--    while production is in test mode. It is matched by the SHA-256 of its
--    lowercased email, so no address is written in this public repository.
--    The change is in the audit log with the status it had before.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "searchQuotaResetAt" TIMESTAMP(3);

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r8d_reset_' || md5(random()::text || clock_timestamp()::text), NULL, 'search.quota.reset.all', 'User', '*',
       json_build_object(
         'accounts', (SELECT count(*) FROM "User"),
         'countedSearches', (SELECT count(*) FROM "role_search_requests" WHERE status IN ('queued', 'running', 'done')),
         'queuedSearches', (SELECT count(*) FROM "role_search_requests" WHERE status = 'queued')
       )::text,
       '{"searchQuotaResetAt":"migration time","queuedCanceled":true}', now();

UPDATE "User" SET "searchQuotaResetAt" = now(), "searchPeriodStartedAt" = NULL;

UPDATE "role_search_requests"
SET status = 'canceled', "completedAt" = now(), error = 'quota reset (round 8d)'
WHERE status = 'queued';

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r8d_test_' || md5(random()::text || clock_timestamp()::text), NULL, 'admin.account.status', 'User', u.id,
       json_build_object('accountStatus', u."accountStatus", 'emailVerified', u."emailVerified" IS NOT NULL)::text,
       '{"accountStatus":"TEST","by":"round 8d migration, founder request"}', now()
FROM "User" u
WHERE encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = '89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c'
  AND u."accountStatus" <> 'TEST';

UPDATE "User" SET "accountStatus" = 'TEST'
WHERE encode(sha256(convert_to(lower(email), 'UTF8')), 'hex') = '89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c';
