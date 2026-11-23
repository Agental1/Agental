-- Round 10, group 4 (founder): one simple account model. Additive.
--
-- 1. "isStaff": the account type Staff (the founders' and the team's
--    accounts). Performer and Casting come from "kind". Test stays a separate
--    flag (accountStatus TEST). Set for admins and accounts with the old STAFF
--    status, and for the founder's own Test account (matched by the SHA-256 of
--    its lowercased email, so no address is in this public repository), which
--    keeps its Test flag. Each change is in the audit log.
-- 2. "ConsentTally": weekly totals of the cookie choices of visitors without
--    an account (choice and count only). RLS on, no policy.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isStaff" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "AuditLog" ("id", "actorUserId", "action", "resourceType", "resourceId", "before", "after", "createdAt")
SELECT 'r10_staff_' || md5(u.id || clock_timestamp()::text), NULL, 'admin.account.type', 'User', u.id,
       json_build_object('type', CASE WHEN u.kind = 'CASTING' THEN 'CASTING' ELSE 'PERFORMER' END, 'accountStatus', u."accountStatus")::text,
       '{"type":"STAFF","by":"round 10 migration, founder request"}', now()
FROM "User" u
WHERE u."isStaff" = false
  AND (u."isAdmin" = true
       OR u."accountStatus" = 'STAFF'
       OR encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = '89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c');

UPDATE "User" SET "isStaff" = true
WHERE "isStaff" = false
  AND ("isAdmin" = true
       OR "accountStatus" = 'STAFF'
       OR encode(sha256(convert_to(lower(email), 'UTF8')), 'hex') = '89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c');

CREATE TABLE IF NOT EXISTS "ConsentTally" (
  "weekStart" TIMESTAMP(3) NOT NULL,
  "choice" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ConsentTally_pkey" PRIMARY KEY ("weekStart", "choice")
);
ALTER TABLE "ConsentTally" ENABLE ROW LEVEL SECURITY;
