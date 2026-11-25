-- Round 11.1, group 3 (founder): "AI searches are open to" becomes "All verified
-- performers at 100%". A stored "Test accounts only" would override the new
-- default, so it is switched here, audited. This only opens QUEUING: searches
-- run only with "Run searches" on (off) and under WORKFLOW_MODE. Idempotent.
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r111s' || substr(md5('search.access' || clock_timestamp()::text), 1, 20), NULL,
       'admin.search.access', 'AppSetting', 'search.access',
       '{"access":"test_only"}', '{"access":"all_verified","via":"round 11.1 group 3, founder''s brief"}', now()
FROM "AppSetting" s
WHERE s."key" = 'search.access' AND s."value" LIKE '%"test_only"%';

UPDATE "AppSetting"
SET "value" = '{"access":"all_verified","since":"' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '"}',
    "updatedAt" = now()
WHERE "key" = 'search.access' AND "value" LIKE '%"test_only"%';
