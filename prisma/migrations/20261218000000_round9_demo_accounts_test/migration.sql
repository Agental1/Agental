-- Round 9 (founder's request, 2026-11-22): the four round-1 demo accounts
-- (@demo.agental.co) become Test accounts, used for the round 9 tests with
-- the founder's own Test account. Data only, no schema change, no row
-- deleted. Each change is in the audit log with the status it had before.
-- Deleted accounts (Admin > Deleted) are left as they are.

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r9_demo_test_' || md5(u.id || clock_timestamp()::text), NULL, 'admin.account.status', 'User', u.id,
       json_build_object('accountStatus', u."accountStatus")::text,
       '{"accountStatus":"TEST","by":"round 9 migration, founder request"}', now()
FROM "User" u
WHERE lower(u.email) LIKE '%@demo.agental.co'
  AND u."accountStatus" <> 'TEST'
  AND u."deletedAt" IS NULL
  AND u."isAdmin" = false;

UPDATE "User"
SET "accountStatus" = 'TEST'
WHERE lower(email) LIKE '%@demo.agental.co'
  AND "accountStatus" <> 'TEST'
  AND "deletedAt" IS NULL
  AND "isAdmin" = false;
