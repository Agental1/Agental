-- Round 11: a deleted account frees its address at once (the person can sign up
-- again); the real address is kept in "deletedEmail" for a restore within 30 days.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedEmail" TEXT;

-- Accounts already deleted before this release: same treatment. Their Google or
-- Apple links are removed too, otherwise a new sign-in would land on the deleted
-- account and be refused. Rows are kept until the usual 30-day purge.
UPDATE "User"
SET "deletedEmail" = "email",
    "email" = 'deleted-' || "id" || '@deleted.agental.invalid'
WHERE "deletedAt" IS NOT NULL
  AND "deletedEmail" IS NULL
  AND "email" NOT LIKE 'deleted-%@deleted.agental.invalid';

DELETE FROM "Account" a
USING "User" u
WHERE a."userId" = u."id" AND u."deletedAt" IS NOT NULL;
