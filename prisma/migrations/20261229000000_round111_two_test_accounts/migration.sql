-- Round 11.1, group 2 (founder's go). Data only, idempotent, no schema change.
--
-- 1. Deletes six demo accounts exactly as softDeleteAccounts does
--    (src/lib/admin/account-removal.ts): soft delete, REVOKED, sessions ended,
--    address freed (kept in "deletedEmail" for a 30-day restore), provider
--    links, pending links and codes removed, one audit entry each. Only rows
--    not yet deleted, and only demo addresses.
-- 2. Creates the two test accounts (Talent, Casting) when no account has that
--    address. No password: the founder sets it from "Forgot password?".

-- Audit first, while the rows still hold their real address.
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r111d' || substr(md5(u."id" || clock_timestamp()::text), 1, 20),
       (SELECT a."id" FROM "User" a WHERE lower(a."email") = 'contact@agental.co' AND a."isAdmin" = true LIMIT 1),
       'admin.account.delete', 'User', u."id",
       json_build_object('emailSha256', encode(sha256(convert_to(lower(trim(u."email")), 'UTF8')), 'hex'),
                         'kind', u."kind", 'status', u."accountStatus",
                         'createdAt', to_char(u."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text,
       json_build_object('deletedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'purgeOn', to_char((now() + interval '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                         'restorableDays', 30, 'emailFreed', true,
                         'providerLinksRemoved', (SELECT count(*) FROM "Account" ac WHERE ac."userId" = u."id"),
                         'via', 'round 11.1 group 2, founder''s go')::text,
       now()
FROM "User" u
WHERE u."id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
                 'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
  AND u."email" LIKE '%@demo.agental.co'
  AND u."deletedAt" IS NULL AND u."isAdmin" = false AND u."isStaff" = false;

DELETE FROM "Account" WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE "id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
                 'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
    AND "email" LIKE '%@demo.agental.co' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

DELETE FROM "VerificationToken" WHERE "identifier" IN (
  SELECT 'verify:' || "id" FROM "User"
  WHERE "id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
                 'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
    AND "email" LIKE '%@demo.agental.co' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false
  UNION ALL
  SELECT 'reset:' || "id" FROM "User"
  WHERE "id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
                 'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
    AND "email" LIKE '%@demo.agental.co' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

DELETE FROM "EmailVerificationCode" WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE "id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
                 'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
    AND "email" LIKE '%@demo.agental.co' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false);

UPDATE "User"
SET "deletedAt" = now(),
    "deletedById" = (SELECT a."id" FROM "User" a WHERE lower(a."email") = 'contact@agental.co' AND a."isAdmin" = true LIMIT 1),
    "deletedPrevStatus" = "accountStatus",
    "accountStatus" = 'REVOKED',
    "sessionsValidAfter" = now(),
    "deletedEmail" = "email",
    "email" = 'deleted-' || "id" || '@deleted.agental.invalid'
WHERE "id" IN ('cmth9cid50000rllhay64f066', 'cmth9citg0005rllhjaf2m33i', 'cmth9cj7k000brllh18qpkopb',
               'cmth9cjlq000grllhp935bwgk', 'cmth9ck2y000mrllhw38md1fe', 'cmth9ckj10012rllhmqo7zg44')
  AND "email" LIKE '%@demo.agental.co' AND "deletedAt" IS NULL AND "isAdmin" = false AND "isStaff" = false;

-- The two test accounts. A deleted account holds a placeholder address, so a
-- plain email match is enough to stay idempotent.
INSERT INTO "User" ("id", "name", "email", "kind", "accountStatus", "locale", "passwordHash", "emailVerified", "createdAt", "updatedAt")
SELECT 'r111' || substr(md5('agental-test-talent'), 1, 21), 'Agental Test Talent', 'contact+talent@agental.co',
       'TALENT', 'TEST', 'en', NULL, NULL, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE lower("email") = 'contact+talent@agental.co');

INSERT INTO "User" ("id", "name", "email", "kind", "accountStatus", "locale", "passwordHash", "emailVerified", "createdAt", "updatedAt")
SELECT 'r111' || substr(md5('agental-test-casting'), 1, 21), 'Agental Test Casting', 'contact+casting@agental.co',
       'CASTING', 'TEST', 'en', NULL, NULL, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE lower("email") = 'contact+casting@agental.co');
