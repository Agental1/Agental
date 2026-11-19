-- Store every User.email trimmed and lowercased, and keep it that way.
--
-- Signup stored emails as typed until the app started normalizing them, so a
-- row can hold "Ana@X.com" while sign-in, signup and the Google and Apple
-- checks look up "ana@x.com". The app matches emails in any letter case
-- (src/lib/auth/user-by-email.ts), so those accounts stay reachable whether
-- the code or this migration reaches production first. This migration then
-- rewrites the stored values, and its index keeps two accounts from ever
-- again differing by letter case alone.
--
-- Steps:
--   1. Stop before changing anything when two rows hold the same email once
--      lowercased. Which account keeps the address is a decision for a
--      person: `bun run db:lowercase-emails` (a dry run) lists the pairs, and
--      docs/SUPABASE_ENVIRONMENTS.md says how to resume the deploy.
--   2. Rewrite the emails that differ from their trimmed, lowercased form.
--   3. Add a unique index on lower(email). Prisma cannot express an
--      expression index in schema.prisma, so it lives here only; the comment
--      on User.email says so.
--
-- Idempotent: a second run finds nothing to rewrite and keeps the index, so
-- the file can be pasted into the Supabase SQL editor first and still be
-- applied by `prisma migrate deploy` later.

-- 1. Collisions. The count is reported, never the addresses: migration
-- errors end up in terminals and in _prisma_migrations.logs.
DO $$
DECLARE collisions integer;
BEGIN
  SELECT count(*) INTO collisions
  FROM (
    SELECT lower(btrim("email"))
    FROM "User"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) AS shared;
  IF collisions > 0 THEN
    RAISE EXCEPTION '% email address(es) belong to more than one account once lowercased. List them with bun run db:lowercase-emails, settle each one by hand, then deploy again.', collisions;
  END IF;
END $$;

-- 2. Rewrite.
UPDATE "User"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

-- 3. Case variants can no longer be inserted, whatever writes the row.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower("email"));
