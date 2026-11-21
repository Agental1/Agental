-- Enable Row Level Security on every table in the public schema.
--
-- Why: Supabase exposes the public schema through its Data API (PostgREST).
-- Without RLS, anyone holding the project's anon key could read and write
-- every table. No policies are added, so the anon and authenticated roles see
-- nothing. The app connects as the table owner (postgres) through Prisma, and
-- RLS does not apply to the owner, so the app is unaffected.
--
-- Already applied to production by hand on 2026-11-18 (28 tables). This
-- migration is idempotent, so `prisma migrate deploy` can run it again safely.
--
-- Tables added by later migrations need their own ENABLE ROW LEVEL SECURITY.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
