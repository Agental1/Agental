-- Round 10, group 3 (founder's request, 2026-11-23): everyone starts again with
-- the full allowance (Basic 5), without deleting history. Data only, no row
-- deleted, same method as round 8d: a new quota reset date (searches from
-- before it no longer count), the period start cleared (the next search opens
-- a new 30-day period), and searches still waiting in the queue (none ever
-- ran: n8n is not connected) marked canceled with a note, except each
-- performer's first automatic search (its key is unique, so a canceled one
-- could never start again). Accounts in the
-- 30-day "Deleted" list are left as they are. One audit entry with the counts.

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r10_reset_' || md5(random()::text || clock_timestamp()::text), NULL, 'search.quota.reset.all', 'User', '*',
       json_build_object(
         'accounts', (SELECT count(*) FROM "User" WHERE "deletedAt" IS NULL),
         'countedSearches', (SELECT count(*) FROM "role_search_requests" WHERE status IN ('queued', 'running', 'done')),
         'queuedSearches', (SELECT count(*) FROM "role_search_requests" WHERE status = 'queued')
       )::text,
       '{"searchQuotaResetAt":"migration time","queuedCanceled":true,"by":"round 10 migration, founder request"}', now();

UPDATE "role_search_requests"
SET status = 'canceled', "completedAt" = now(), error = 'quota reset (round 10)'
WHERE status = 'queued'
  -- The first automatic search keeps its place: canceling it would block it for good.
  AND "clientKey" IS DISTINCT FROM 'auto_first';

UPDATE "User" SET "searchQuotaResetAt" = now(), "searchPeriodStartedAt" = NULL
WHERE "deletedAt" IS NULL;
