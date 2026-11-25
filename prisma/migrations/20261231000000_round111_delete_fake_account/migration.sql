-- Round 11.1 (founder's request, 2026-11-25): one fake account (typo domain,
-- never verified, never signed in) deleted exactly as softDeleteAccounts does:
-- address freed, restorable for 30 days, audited. Idempotent, data only.

-- Audit first, while the rows still hold their real address.
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r111f' || substr(md5(u."id" || clock_timestamp()::text), 1, 20),
       (SELECT a."id" FROM "User" a WHERE lower(a."email") = 'contact@agental.co' AND a."isAdmin" = true LIMIT 1),
       'admin.account.delete', 'User', u."id",
       json_build_object('emailSha256', encode(sha256(convert_to(lower(trim(u."email")), 'UTF8')), 'hex'),
                         'kind', u."kind", 'status', u."accountStatus",
                         'createdAt', to_char(u."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text,
       json_build_object('deletedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'purgeOn', to_char((now() + interval '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'restorableDays', 30, 'emailFreed', true,
                         'providerLinksRemoved', (SELECT count(*) FROM "Account" ac WHERE ac."userId" = u."id"),
                         'via', 'round 11.1, founder''s request (fake address)')::text,
       now()
FROM "User" u
WHERE u."id" IN ('cmwnbgm4h000008l6mb5iyb4d')
  AND u."email" LIKE '%@gmai.com'
  AND u."deletedAt" IS NULL AND u."isAdmin" = false AND u."isStaff" = false;

DELETE FROM "Account" WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE "id" IN ('cmwnbgm4h000008l6mb5iyb4d')
    AND "email" LIKE '%@gmai.com' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

DELETE FROM "VerificationToken" WHERE "identifier" IN (
  SELECT 'verify:' || "id" FROM "User"
  WHERE "id" IN ('cmwnbgm4h000008l6mb5iyb4d')
    AND "email" LIKE '%@gmai.com' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false
  UNION ALL
  SELECT 'reset:' || "id" FROM "User"
  WHERE "id" IN ('cmwnbgm4h000008l6mb5iyb4d')
    AND "email" LIKE '%@gmai.com' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

DELETE FROM "EmailVerificationCode" WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE "id" IN ('cmwnbgm4h000008l6mb5iyb4d')
    AND "email" LIKE '%@gmai.com' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

UPDATE "User"
SET "deletedAt" = now(),
    "deletedById" = (SELECT a."id" FROM "User" a WHERE lower(a."email") = 'contact@agental.co' AND a."isAdmin" = true LIMIT 1),
    "deletedPrevStatus" = "accountStatus",
    "accountStatus" = 'REVOKED',
    "sessionsValidAfter" = now(),
    "deletedEmail" = "email",
    "email" = 'deleted-' || "id" || '@deleted.agental.invalid'
WHERE "id" IN ('cmwnbgm4h000008l6mb5iyb4d')
  AND "email" LIKE '%@gmai.com' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false;
