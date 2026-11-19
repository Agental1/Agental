-- Lock down what Supabase's API roles can reach in the public schema.
--
-- 20261118000000_enable_rls turned on Row Level Security with no policies, so
-- the anon and authenticated roles (the Data API, supabase-js, Realtime) see
-- no rows. Those roles still held Supabase's default grants on every table,
-- and every new table gave them the same grants again. This migration takes
-- the grants away. Each of the two measures keeps the anon key out on its own,
-- so a table that loses RLS, or gains a permissive policy by mistake, stays
-- closed.
--
-- Steps:
--   1. Enable RLS again on every table in public except _prisma_migrations.
--   2. Revoke every privilege anon and authenticated hold on the tables,
--      sequences and routines (functions and procedures) of public, and
--      EXECUTE from PUBLIC on those routines.
--   3. Remove the default privileges that would grant anon and authenticated
--      access to objects the postgres role creates in public later. Prisma
--      migrations run as postgres, so this covers every future table.
--
-- Left as they are, on purpose:
--   - The postgres role. Prisma connects as postgres, the owner of every
--     table, and RLS does not apply to a table's owner, so the app keeps
--     working.
--   - FORCE ROW LEVEL SECURITY stays off. Forcing applies RLS to the owner as
--     well, and with no policies Prisma would read zero rows. This matters most
--     for _prisma_migrations, which Prisma reads on every deploy.
--   - service_role, which bypasses RLS by design.
--   - Roles and passwords. The repository is public, so the app's
--     least-privilege role is created by hand in each environment.
--
-- Idempotent: a second run changes nothing, so the file can be pasted into
-- the Supabase SQL editor first and still be applied by
-- `prisma migrate deploy` later. On a Postgres without Supabase's roles (a CI
-- or local container), steps 2 and 3 skip the missing roles.
--
-- Verification queries and the plan for the app's own role:
-- docs/DATA_SECURITY.md.

-- 1. Row Level Security on every table in public.
--
-- Same loop as 20261118000000_enable_rls, so a table created since then is
-- covered too. ENABLE on a table that already has RLS is a no-op.
-- _prisma_migrations belongs to the migration tool: its access is handled by
-- the revokes below, and RLS would change nothing for its owner.
-- The loop stops with an error if another role owns a table in public. That is
-- intended: a table this migration cannot secure should block the deploy until
-- someone looks at it.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- 2 and 3. Grants and default privileges for anon and authenticated.
--
-- ROUTINES covers functions and procedures alike. The default privileges are
-- the ones Supabase sets for objects created by postgres in public; reversing
-- them means a table added by a later migration starts with no grants for
-- these roles.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM %I', r);

      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Postgres also grants EXECUTE on every new routine to PUBLIC, a role that all
-- other roles belong to. This revokes it on the routines that exist today.
-- For future routines that grant is a built-in global default, which a
-- per-schema ALTER DEFAULT PRIVILEGES cannot remove: a migration that adds a
-- function to public has to run its own REVOKE EXECUTE ... FROM PUBLIC.
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
