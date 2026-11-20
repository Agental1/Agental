-- AI role searches: one row per "Start finding roles" click. Additive: a new
-- table only. n8n reads rows with status 'queued' (contract in docs/HANDOFF.md).
CREATE TABLE "public"."role_search_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "clientKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_search_requests_pkey" PRIMARY KEY ("id")
);

-- The quota guard of last resort: two rows can never share a slot.
CREATE UNIQUE INDEX "role_search_requests_userId_periodKey_seq_key" ON "public"."role_search_requests"("userId", "periodKey", "seq");
-- A retried click (same clientKey) stores one row.
CREATE UNIQUE INDEX "role_search_requests_userId_clientKey_key" ON "public"."role_search_requests"("userId", "clientKey");
-- What the workflow polls.
CREATE INDEX "role_search_requests_status_createdAt_idx" ON "public"."role_search_requests"("status", "createdAt");

ALTER TABLE "public"."role_search_requests" ADD CONSTRAINT "role_search_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security. The app signs people in with Auth.js, not Supabase Auth,
-- so auth.uid() means nothing here: the Data API roles (anon, authenticated)
-- get no policy and see no row. The app reads as the table owner and applies
-- the rule itself: a performer reads only their own rows (WHERE "userId" =
-- session user), an admin reads all (isAdmin checked on the server).
ALTER TABLE "public"."role_search_requests" ENABLE ROW LEVEL SECURITY;
-- Default privileges already leave new tables without grants for these roles
-- (20261119000000_lock_public_grants); said again here, where the roles exist.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.role_search_requests FROM %I', r);
    END IF;
  END LOOP;
END $$;
