-- Agental database schema before round 8 (schema only, no data).
-- Built on 2026-11-22 from every applied Prisma migration in prisma/migrations, in order.
-- Production applies exactly these files (tools/db/migrate-on-production-build.mjs).
-- No Supabase CLI or production database access from this Mac, so this is the migration
-- history rather than a pg_dump; replaying it on an empty Postgres gives the pre-r8 schema.

-- ===== 20260831000000_init =====
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TALENT',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ArtistProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "legalName" TEXT,
    "birthDate" TIMESTAMP(3),
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "physical" TEXT NOT NULL DEFAULT '{}',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "mobilityCountries" TEXT NOT NULL DEFAULT '[]',
    "minRateCents" INTEGER,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'BEGINNER',
    "tags" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "zones" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfTape" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "projectId" TEXT,
    "takeNumber" INTEGER NOT NULL DEFAULT 1,
    "qualityScore" INTEGER,
    "qualityBreakdown" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "lowBandwidth" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfTape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "projectRef" TEXT,
    "role" TEXT NOT NULL,
    "cachetCents" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "CareerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandat" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "documentVersion" TEXT NOT NULL DEFAULT 'v1',
    "signedAt" TIMESTAMP(3),
    "signatureIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mandat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "seatCount" INTEGER,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,
    "siretStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scope" TEXT NOT NULL DEFAULT '{}',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "seatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EMPTY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "roleSpec" TEXT NOT NULL DEFAULT '{}',
    "shootingFrom" TIMESTAMP(3),
    "shootingTo" TIMESTAMP(3),
    "budgetCents" INTEGER,
    "briefFiles" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidature" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artistProfileId" TEXT,
    "externalTalentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AGENTAL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimatedRateCents" INTEGER,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeline" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "Candidature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchScore" (
    "id" TEXT NOT NULL,
    "candidatureId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,
    "factors" TEXT NOT NULL DEFAULT '{}',
    "diversityFlags" TEXT NOT NULL DEFAULT '[]',
    "scorerVersion" TEXT NOT NULL DEFAULT 'mock-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTalent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agency" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinorCase" (
    "id" TEXT NOT NULL,
    "artistProfileId" TEXT NOT NULL,
    "projectId" TEXT,
    "prefectoralAuthStatus" TEXT NOT NULL DEFAULT 'NONE',
    "authRef" TEXT,
    "escrowPercent" INTEGER NOT NULL DEFAULT 90,
    "escrowStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "parentalPresence" BOOLEAN NOT NULL DEFAULT false,
    "guardianContact" TEXT NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL DEFAULT 'OPENED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinorCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT,
    "body" TEXT NOT NULL,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" TEXT NOT NULL DEFAULT '{}',
    "after" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistProfile_userId_key" ON "ArtistProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SelfTape_mediaId_key" ON "SelfTape"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Mandat_profileId_key" ON "Mandat"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subjectId_key" ON "Subscription"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_seatId_key" ON "Membership"("seatId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchScore_candidatureId_key" ON "MatchScore"("candidatureId");

-- CreateIndex
CREATE UNIQUE INDEX "MinorCase_artistProfileId_key" ON "MinorCase"("artistProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_subjectId_metric_period_key" ON "UsageCounter"("subjectId", "metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_externalId_key" ON "WebhookEvent"("externalId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistProfile" ADD CONSTRAINT "ArtistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialty" ADD CONSTRAINT "Specialty_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfTape" ADD CONSTRAINT "SelfTape_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfTape" ADD CONSTRAINT "SelfTape_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerEntry" ADD CONSTRAINT "CareerEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandat" ADD CONSTRAINT "Mandat_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidature" ADD CONSTRAINT "Candidature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidature" ADD CONSTRAINT "Candidature_artistProfileId_fkey" FOREIGN KEY ("artistProfileId") REFERENCES "ArtistProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidature" ADD CONSTRAINT "Candidature_externalTalentId_fkey" FOREIGN KEY ("externalTalentId") REFERENCES "ExternalTalent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "Candidature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinorCase" ADD CONSTRAINT "MinorCase_artistProfileId_fkey" FOREIGN KEY ("artistProfileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinorCase" ADD CONSTRAINT "MinorCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===== 20260831160000_match_reasons =====
-- AlterTable
ALTER TABLE "MatchScore" DROP COLUMN "justification",
ADD COLUMN     "reasons" TEXT NOT NULL DEFAULT '[]';


-- ===== 20261118000000_enable_rls =====
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

-- ===== 20261119000000_lock_public_grants =====
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

-- ===== 20261120000000_normalize_user_emails =====
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

-- ===== 20261121000000_round2_server =====
-- Round 2 server work: direct uploads, the Limelight data model, college
-- student codes, rate limiting, cookie consent and the first-run flag.
--
-- Every change is additive, so the code already in production keeps working
-- while this runs. Each new table gets Row Level Security in this same file
-- (tests/db enforces it): the app connects as the owner and is unaffected,
-- and the Data API roles see nothing.

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "destination" TEXT NOT NULL DEFAULT 'profile',
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "sizeBytes" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "compPlan" TEXT,
ADD COLUMN     "compUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentAnalytics" BOOLEAN,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentMarketing" BOOLEAN,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3),
ADD COLUMN     "studentVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "destination" TEXT NOT NULL DEFAULT 'profile',
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subdomain" TEXT,
    "customDomain" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "siteId" TEXT,
    "offer" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "studentDiscount" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerSessionId" TEXT,
    "providerPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "hostingRenewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPriceRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPriceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCodeRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storageKey_key" ON "Upload"("storageKey");

-- CreateIndex
CREATE INDEX "Upload_profileId_idx" ON "Upload"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_subdomain_key" ON "Site"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Site_customDomain_key" ON "Site"("customDomain");

-- CreateIndex
CREATE INDEX "Site_userId_idx" ON "Site"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteOrder_providerSessionId_key" ON "SiteOrder"("providerSessionId");

-- CreateIndex
CREATE INDEX "SiteOrder_userId_idx" ON "SiteOrder"("userId");

-- CreateIndex
CREATE INDEX "SiteOrder_siteId_idx" ON "SiteOrder"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentPriceRequest_userId_key" ON "StudentPriceRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCode_codeHash_key" ON "StudentCode"("codeHash");

-- CreateIndex
CREATE INDEX "StudentCodeRedemption_userId_idx" ON "StudentCodeRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCodeRedemption_codeId_userId_key" ON "StudentCodeRedemption"("codeId", "userId");

-- CreateIndex
CREATE INDEX "RateLimitEvent_key_createdAt_idx" ON "RateLimitEvent"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPriceRequest" ADD CONSTRAINT "StudentPriceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCodeRedemption" ADD CONSTRAINT "StudentCodeRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "StudentCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCodeRedemption" ADD CONSTRAINT "StudentCodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security on the new tables. No policies: owner-only access.
ALTER TABLE "Upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPriceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCodeRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitEvent" ENABLE ROW LEVEL SECURITY;

-- Self-tapes recorded so far become private library items: a recording is
-- seen by its owner only until they choose to submit it.
UPDATE "Media" SET "destination" = 'library' WHERE "type" = 'SELFTAPE';

-- Accounts that already finished onboarding keep landing on their dashboard.
-- Talents: a signed, active mandate. Casting: an organisation they own.
UPDATE "User" u
SET "onboardingCompletedAt" = CURRENT_TIMESTAMP
WHERE u."onboardingCompletedAt" IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM "ArtistProfile" p
      JOIN "Mandat" m ON m."profileId" = p."id"
      WHERE p."userId" = u."id" AND m."status" = 'ACTIVE' AND m."signedAt" IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM "Membership" ms WHERE ms."userId" = u."id" AND ms."role" = 'OWNER'
    )
  );

-- ===== 20261122000000_beta_server =====
-- Beta server work: self-tape versions and share links, the actor-side
-- workflow (briefs, fit evaluations, application drafts, runs), and the
-- Limelight module (lead intake, outbox, site domains and revisions).
--
-- Limelight's new tables get their own Postgres schema. Supabase's Data API
-- exposes "public" only, so nothing in "limelight" is reachable through it,
-- and a dedicated database role can be scoped to that schema later.
--
-- Everything in this migration is ADDITIVE: new tables, and new columns that
-- are nullable or have a default. Nothing is renamed, moved or dropped, so the
-- code that ran before this migration keeps working on the database after it.
-- That is what lets a release be put back one step (docs/RELEASES.md).
--
-- For that reason the three Limelight tables that already exist (Site,
-- SiteOrder, StudentPriceRequest) stay in "public" for now. Moving them is a
-- later step that needs compatibility views for one release.

CREATE SCHEMA IF NOT EXISTS "limelight";

-- Sites publish a revision the customer approved, never the working draft.
ALTER TABLE "public"."Site" ADD COLUMN "approvedRevisionId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "publishedRevisionId" TEXT,
ADD COLUMN "showContact" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SelfTape" ADD COLUMN     "tapeId" TEXT;

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "demoBrief" TEXT,
ADD COLUMN     "tapeId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "Tape" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "demoBrief" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaShare" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "production" TEXT,
    "roleName" TEXT,
    "roleType" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "country" TEXT,
    "remote" BOOLEAN,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "paid" BOOLEAN,
    "rateCents" INTEGER,
    "unionStatus" TEXT,
    "requirements" TEXT NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" TEXT NOT NULL DEFAULT '{}',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitEvaluation" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rulesPassed" TEXT NOT NULL DEFAULT '[]',
    "ruleFailures" TEXT NOT NULL DEFAULT '[]',
    "unknowns" TEXT NOT NULL DEFAULT '[]',
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "profileEvidence" TEXT NOT NULL DEFAULT '[]',
    "briefEvidence" TEXT NOT NULL DEFAULT '[]',
    "ruleVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDraft" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reviewDecision" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftMedia" (
    "draftId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftMedia_pkey" PRIMARY KEY ("draftId","mediaId")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "modelCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "subjectRef" TEXT,
    "lastError" TEXT,
    "result" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limelight"."LimelightLead" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "performerType" TEXT,
    "portfolioUrl" TEXT,
    "need" TEXT,
    "contactPref" TEXT NOT NULL DEFAULT 'email',
    "phone" TEXT,
    "source" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "submissions" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimelightLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limelight"."OutboxMessage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limelight"."SiteDomain" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limelight"."SiteRevision" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tape_profileId_idx" ON "Tape"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaShare_tokenHash_key" ON "MediaShare"("tokenHash");

-- CreateIndex
CREATE INDEX "MediaShare_mediaId_idx" ON "MediaShare"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_dedupeKey_key" ON "Brief"("dedupeKey");

-- CreateIndex
CREATE INDEX "Brief_status_expiresAt_idx" ON "Brief"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "FitEvaluation_profileId_idx" ON "FitEvaluation"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "FitEvaluation_briefId_profileId_inputHash_key" ON "FitEvaluation"("briefId", "profileId", "inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDraft_idempotencyKey_key" ON "ApplicationDraft"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDraft_profileId_briefId_key" ON "ApplicationDraft"("profileId", "briefId");

-- CreateIndex
CREATE INDEX "DraftMedia_mediaId_idx" ON "DraftMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_idempotencyKey_key" ON "WorkflowRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowRun_kind_status_idx" ON "WorkflowRun"("kind", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_createdAt_idx" ON "WorkflowRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LimelightLead_reference_key" ON "limelight"."LimelightLead"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "LimelightLead_email_key" ON "limelight"."LimelightLead"("email");

-- CreateIndex
CREATE INDEX "LimelightLead_status_firstSeenAt_idx" ON "limelight"."LimelightLead"("status", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "limelight"."OutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "limelight"."OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDomain_hostname_key" ON "limelight"."SiteDomain"("hostname");

-- CreateIndex
CREATE INDEX "SiteDomain_siteId_idx" ON "limelight"."SiteDomain"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteRevision_siteId_version_key" ON "limelight"."SiteRevision"("siteId", "version");

-- CreateIndex
CREATE INDEX "SelfTape_tapeId_idx" ON "SelfTape"("tapeId");

-- AddForeignKey
ALTER TABLE "SelfTape" ADD CONSTRAINT "SelfTape_tapeId_fkey" FOREIGN KEY ("tapeId") REFERENCES "Tape"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tape" ADD CONSTRAINT "Tape_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaShare" ADD CONSTRAINT "MediaShare_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitEvaluation" ADD CONSTRAINT "FitEvaluation_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitEvaluation" ADD CONSTRAINT "FitEvaluation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDraft" ADD CONSTRAINT "ApplicationDraft_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDraft" ADD CONSTRAINT "ApplicationDraft_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDraft" ADD CONSTRAINT "ApplicationDraft_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "FitEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftMedia" ADD CONSTRAINT "DraftMedia_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ApplicationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftMedia" ADD CONSTRAINT "DraftMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limelight"."SiteDomain" ADD CONSTRAINT "SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limelight"."SiteRevision" ADD CONSTRAINT "SiteRevision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security on every new table. No policies: owner-only access.
ALTER TABLE "Tape" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FitEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApplicationDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limelight"."LimelightLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limelight"."OutboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limelight"."SiteDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limelight"."SiteRevision" ENABLE ROW LEVEL SECURITY;

-- The limelight schema is closed to the API roles, now and for tables added
-- later. The roles exist on Supabase only, so each step is guarded.
REVOKE ALL ON SCHEMA "limelight" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA "limelight" FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA "limelight" FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA "limelight" FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA "limelight" REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA "limelight" REVOKE ALL ON SEQUENCES FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

-- Every self-tape recorded so far becomes the first version of its own tape,
-- titled by its take number, so the library has one shape.
INSERT INTO "Tape" ("id", "profileId", "title", "createdAt", "updatedAt")
SELECT 'tape_' || st."id", m."profileId", 'Self-tape ' || st."takeNumber", st."createdAt", st."createdAt"
FROM "SelfTape" st JOIN "Media" m ON m."id" = st."mediaId"
WHERE st."tapeId" IS NULL;
UPDATE "SelfTape" SET "tapeId" = 'tape_' || "id" WHERE "tapeId" IS NULL;

-- ===== 20261122010000_account_timestamps =====
-- When a sign-in method (Google, Apple) joined an account and when it was last
-- used, for the Connected accounts screen.
--
-- Added in two steps on purpose: a column created with a default would stamp
-- every existing connection with the time of this migration, which would be a
-- false "connected on" date. Existing rows stay empty; new rows get the time.
ALTER TABLE "public"."Account" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "public"."Account" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "public"."Account" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

-- ===== 20261122020000_team_messages =====
-- Human Messages: one thread between a performer and the Agental team, on the
-- existing Thread and Message tables. Additive: every new column is nullable
-- or has a default, and existing rows keep their meaning (kind GENERAL).
ALTER TABLE "Thread" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "userId" TEXT,
ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- fromTeam says which side wrote a message without exposing who on the team.
-- clientKey is a random id the browser makes per draft: sending the same
-- draft twice (a retry, a double click) hits the unique index and stores one
-- message.
ALTER TABLE "Message" ADD COLUMN "fromTeam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "clientKey" TEXT;

-- One team thread per performer. Rows without a user (older threads) are not
-- constrained: NULLs are distinct in a unique index.
CREATE UNIQUE INDEX "Thread_userId_kind_key" ON "Thread"("userId", "kind");
CREATE INDEX "Thread_kind_lastMessageAt_idx" ON "Thread"("kind", "lastMessageAt");
CREATE UNIQUE INDEX "Message_threadId_clientKey_key" ON "Message"("threadId", "clientKey");
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who may be put through a real casting workflow run. Every existing and new
-- account starts UNREVIEWED, which is refused: test accounts are marked TEST
-- and real performers ELIGIBLE by hand, after review. Nothing runs for an
-- account nobody has looked at.
ALTER TABLE "User" ADD COLUMN "workflowAccess" TEXT NOT NULL DEFAULT 'UNREVIEWED';

-- ===== 20261123000000_profile_links =====
-- Two optional profile links: an IMDb name page and a portfolio or website.
-- Additive only: nullable columns, no default, nothing rewritten.
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "imdbUrl" TEXT;
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "portfolioUrl" TEXT;

-- ===== 20261124000000_role_search_requests =====
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

-- ===== 20261125000000_avatar_student_email =====
-- Round 3 Group 4. Additive only: nullable columns and one new table.

-- Profile picture.
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "avatarKey" TEXT;
ALTER TABLE "public"."ArtistProfile" ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);

-- College student discount by school email: the address that proved it.
-- Unique, so one school address verifies one account. NULLs do not collide.
ALTER TABLE "public"."User" ADD COLUMN "studentEmail" TEXT;
CREATE UNIQUE INDEX "User_studentEmail_key" ON "public"."User"("studentEmail");

CREATE TABLE "public"."StudentEmailClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentEmailClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentEmailClaim_tokenHash_key" ON "public"."StudentEmailClaim"("tokenHash");
CREATE INDEX "StudentEmailClaim_userId_createdAt_idx" ON "public"."StudentEmailClaim"("userId", "createdAt");
CREATE INDEX "StudentEmailClaim_email_idx" ON "public"."StudentEmailClaim"("email");
ALTER TABLE "public"."StudentEmailClaim" ADD CONSTRAINT "StudentEmailClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No Data API access, as for every table (RLS on, no policy).
ALTER TABLE "public"."StudentEmailClaim" ENABLE ROW LEVEL SECURITY;

-- ===== 20261126000000_assistant_messages =====
-- Round 3 Group 5: the assistant in Messages. Additive only.
ALTER TABLE "public"."Message" ADD COLUMN "topic" TEXT;
ALTER TABLE "public"."Message" ADD COLUMN "fromAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Thread" ADD COLUMN "waitingForTeamSince" TIMESTAMP(3);
CREATE INDEX "Thread_kind_waitingForTeamSince_idx" ON "public"."Thread"("kind", "waitingForTeamSince");

-- ===== 20261127000000_search_period =====
-- Round 4 Group B. Additive only: one nullable column.
-- Start of the user's current 30-day AI search period (set by their first
-- search, renewed by the first search after it ends).
ALTER TABLE "public"."User" ADD COLUMN "searchPeriodStartedAt" TIMESTAMP(3);

-- ===== 20261128000000_account_status =====
-- Round 7: account status set by staff, and the agents opt-in. Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "agentsOptInAt" TIMESTAMP(3);
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "autoSearchOptIn" BOOLEAN NOT NULL DEFAULT false;

-- Carry over the older classification (workflowAccess) so nothing reviewed is lost.
UPDATE "public"."User" SET "accountStatus" = 'TEST' WHERE "workflowAccess" = 'TEST' AND "accountStatus" = 'UNREVIEWED';
UPDATE "public"."User" SET "accountStatus" = 'APPROVED' WHERE "workflowAccess" = 'ELIGIBLE' AND "accountStatus" = 'UNREVIEWED';

-- A first click on "Start finding roles" before this column existed counts as the opt-in.
UPDATE "public"."User" u SET "agentsOptInAt" = r.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "public"."role_search_requests" GROUP BY "userId") r
WHERE r."userId" = u.id AND u."agentsOptInAt" IS NULL;

CREATE INDEX IF NOT EXISTS "User_accountStatus_idx" ON "public"."User" ("accountStatus");

-- ===== 20261128010000_search_claim =====
-- Round 7 Part C: which n8n execution claimed a search. Additive only.
ALTER TABLE "public"."role_search_requests" ADD COLUMN IF NOT EXISTS "claimedBy" TEXT;

-- ===== 20261128020000_inbox_replies =====
-- Round 7 Part C/D: direct email replies handled by n8n. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "public"."InboxReply" (
    "id" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "executionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "sentMessageId" TEXT,
    "reason" TEXT,
    "queue" TEXT,
    "priority" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxReply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxReply_claimId_key" ON "public"."InboxReply"("claimId");
CREATE UNIQUE INDEX IF NOT EXISTS "InboxReply_gmailThreadId_gmailMessageId_key" ON "public"."InboxReply"("gmailThreadId", "gmailMessageId");
CREATE INDEX IF NOT EXISTS "InboxReply_status_createdAt_idx" ON "public"."InboxReply"("status", "createdAt");
-- Same rule as every table: no access through the Data API.
ALTER TABLE "public"."InboxReply" ENABLE ROW LEVEL SECURITY;

-- ===== 20261129000000_settings_consent =====
-- Round 7b, Group 1: the policy version a cookie choice was made under, and the
-- notification preferences of Settings. Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyApplications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "notifyProduct" BOOLEAN NOT NULL DEFAULT false;

-- ===== 20261130000000_media_categories =====
-- Round 7b, Group 2: profile media in four categories, each item with a short
-- description. Additive only. Existing media moves to the closest category.
ALTER TABLE "public"."Media" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "public"."Media" ADD COLUMN IF NOT EXISTS "description" TEXT;

UPDATE "public"."Media" SET "category" = CASE
  WHEN "type" = 'PHOTO' THEN 'SELF'
  WHEN "type" IN ('VIDEO', 'SELFTAPE') THEN 'VIDEOS'
  ELSE 'OTHER'
END
WHERE "category" IS NULL;

-- ===== 20261201000000_account_deletion =====
-- Round 7b, Group 3: when an unverified account was told it would be deleted.
-- Additive only.
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "deletionWarnedAt" TIMESTAMP(3);

-- ===== 20261202000000_application_responses =====
-- Round 7b, Group 4.2: answering a role from Applications. Additive only.
-- What a role asks for (questions, videos), the performer's answers, and when
-- the role was accepted and the response submitted for the team's review.
ALTER TABLE "public"."Brief" ADD COLUMN IF NOT EXISTS "submission" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "answers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "public"."ApplicationDraft" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "public"."DraftMedia" ADD COLUMN IF NOT EXISTS "slot" INTEGER;

-- ===== 20261203000000_email_log =====
-- Admin site: a log of every email the app sends, updated by Resend's
-- webhook (sent, delivered, bounced...). Additive only. RLS on with no policy:
-- the Data API sees nothing; only the server reads it.
CREATE TABLE IF NOT EXISTS "public"."EmailLog" (
  "id" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "resendId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEventAt" TIMESTAMP(3),
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLog_resendId_key" ON "public"."EmailLog" ("resendId");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "public"."EmailLog" ("createdAt");
ALTER TABLE "public"."EmailLog" ENABLE ROW LEVEL SECURITY;

-- ===== prisma/schema.prisma at pre-r8 (for reference) =====
-- // Agental — provider-agnostic Prisma schema, running on PostgreSQL (Supabase).
-- // It was authored against SQLite and deliberately kept portable: enums are
-- // Strings validated by Zod in src/domain, JSON blobs and scalar lists are
-- // Strings, money is integer cents. That portability is why moving to Postgres
-- // changed the datasource and nothing else — no model was touched.
-- //
-- // CRITICAL DOMAIN RULE: Mandat (free legal representation) is structurally
-- // separate from Subscription (optional paid tech service). Mandat has no price
-- // and no plan; opportunity access depends on Mandat.status, never on Subscription.
-- 
-- generator client {
--   provider = "prisma-client"
--   output   = "../src/generated/prisma"
-- }
-- 
-- // Two Postgres schemas. "public" holds the Agental app. "limelight" holds the
-- // website offer (leads, sites, domains, orders): its own schema keeps it out
-- // of Supabase's Data API, which exposes "public" only, and lets a dedicated
-- // database role be scoped to it later.
-- datasource db {
--   provider = "postgresql"
--   schemas  = ["public", "limelight"]
-- }
-- 
-- // ─────────────────────────── Identity & auth (Auth.js) ───────────────────────
-- 
-- model User {
--   id            String    @id @default(cuid())
--   name          String?
--   email         String    @unique // lowercase; also unique by lower(email) via "User_email_lower_key", an index this file cannot express (migration 20261120000000_normalize_user_emails): remove any generated DROP INDEX of it
--   emailVerified DateTime?
--   image         String?
--   passwordHash  String?
--   kind          String    @default("TALENT") // TALENT | CASTING
--   isAdmin       Boolean   @default(false)
--   locale        String    @default("fr")
--   createdAt     DateTime  @default(now())
--   updatedAt     DateTime  @updatedAt
-- 
--   // Stamped when the first-run landing has been served (profile completeness
--   // for talents). Null means the next sign-in is the first one.
--   onboardingCompletedAt DateTime?
--   // Cookie consent. Null means no choice recorded yet (only strictly necessary
--   // cookies apply). consentAt is when the current choice was made.
--   consentAnalytics      Boolean?
--   consentMarketing      Boolean?
--   consentAt             DateTime?
--   // The policy version the choice was made under (CONSENT_POLICY_VERSION). A newer
--   // version asks again.
--   consentVersion        String?
--   // Email notifications, set in Settings. Product news is opt-in.
--   notifyApplications    Boolean   @default(true)
--   notifyMessages        Boolean   @default(true)
--   notifyProduct         Boolean   @default(false)
--   // When the "verify within N days or the account is deleted" email went out
--   // (admin > Account cleanup). Null when never warned.
--   deletionWarnedAt      DateTime?
--   // Set when a college student code was redeemed.
--   studentVerifiedAt     DateTime?
--   // The school address that proved it (lowercase). One account per address.
--   studentEmail          String?   @unique
--   /// Start of the current 30-day AI search period (null before the first search).
--   searchPeriodStartedAt DateTime?
--   // Sessions issued before this instant are refused (see src/auth.ts). Set
--   // when a provider sign-in takes over an account whose password was never
--   // proven to belong to the email's owner.
--   sessionsValidAfter    DateTime?
--   // Who may go through a real casting workflow run. UNREVIEWED (the default)
--   // is refused, so an account nobody has classified never runs. TEST marks the
--   // owner's own test accounts: staging and synthetic runs only.
--   workflowAccess        String    @default("UNREVIEWED") // UNREVIEWED | TEST | ELIGIBLE | EXCLUDED (round 7: no longer read, see accountStatus)
--   // Set by staff on /admin/comptes, every change audited (round 7).
--   // UNREVIEWED (default) | APPROVED (a real account) | TEST | STAFF | SPAM.
--   // Agents run only for APPROVED accounts in live, TEST accounts in staging
--   // (src/domain/workflow/eligibility.ts).
--   accountStatus         String    @default("UNREVIEWED")
--   // First "Start finding roles" click: the performer's opt-in to the agents.
--   agentsOptInAt         DateTime?
--   // Opt-in to the six-hour automatic search.
--   autoSearchOptIn       Boolean   @default(false)
-- 
--   accounts            Account[]
--   sessions            Session[]
--   artistProfile       ArtistProfile?
--   memberships         Membership[]
--   auditLogs           AuditLog[]
--   notifications       Notification[]
--   messages            Message[]
--   threads             Thread[]
--   roleSearchRequests  RoleSearchRequest[]
--   studentEmailClaims  StudentEmailClaim[]
--   sites               Site[]
--   siteOrders          SiteOrder[]
--   studentPriceRequest StudentPriceRequest?
--   studentRedemptions  StudentCodeRedemption[]
-- 
--   @@index([accountStatus])
--   @@schema("public")
-- }
-- 
-- model Account {
--   id                String  @id @default(cuid())
--   userId            String
--   type              String
--   provider          String
--   providerAccountId String
--   refresh_token     String?
--   access_token      String?
--   expires_at        Int?
--   token_type        String?
--   scope             String?
--   id_token          String?
--   session_state     String?
--   // When this sign-in method joined the account, and the last time it was
--   // used. Empty for connections made before these columns existed.
--   createdAt         DateTime? @default(now())
--   lastUsedAt        DateTime?
-- 
--   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@unique([provider, providerAccountId])
--   @@schema("public")
-- }
-- 
-- model Session {
--   id           String   @id @default(cuid())
--   sessionToken String   @unique
--   userId       String
--   expires      DateTime
--   user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model VerificationToken {
--   identifier String
--   token      String
--   expires    DateTime
-- 
--   @@unique([identifier, token])
--   @@schema("public")
-- }
-- 
-- // ─────────────────────────── B2C — Artist domain ─────────────────────────────
-- 
-- model ArtistProfile {
--   id                String    @id @default(cuid())
--   userId            String    @unique
--   stageName         String
--   legalName         String?
--   birthDate         DateTime?
--   isMinor           Boolean   @default(false)
--   phone             String?
--   city              String?
--   bio               String?
--   physical          String    @default("{}") // JSON: height, hair, eyes, build…
--   preferences       String    @default("{}") // JSON: auto-candidature prefs, constraints
--   mobilityCountries String    @default("[]") // JSON string[]
--   minRateCents      Int?
--   imdbUrl           String?   // optional, imdb.com/name/... only
--   portfolioUrl      String?   // optional, any https URL
--   // Profile picture: a square JPEG in storage under {userId}/avatar/. Null: initials.
--   avatarKey         String?
--   avatarUpdatedAt   DateTime?
--   completenessScore Int       @default(0)
--   status            String    @default("DRAFT") // DRAFT | ACTIVE
--   createdAt         DateTime  @default(now())
--   updatedAt         DateTime  @updatedAt
-- 
--   user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
--   specialties       Specialty[]
--   availability      Availability[]
--   media             Media[]
--   uploads           Upload[]
--   tapes             Tape[]
--   fitEvaluations    FitEvaluation[]
--   applicationDrafts ApplicationDraft[]
--   candidatures      Candidature[]
--   careerEntries     CareerEntry[]
--   mandat            Mandat?
--   minorCase         MinorCase?
-- 
--   @@schema("public")
-- }
-- 
-- model Specialty {
--   id        String @id @default(cuid())
--   profileId String
--   kind      String // voir SpecialtyKind dans src/domain/enums.ts — la liste y est la source de verite
--   level     String @default("BEGINNER") // BEGINNER | INTERMEDIATE | CONFIRMED
--   tags      String @default("[]") // JSON string[]
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model Availability {
--   id        String   @id @default(cuid())
--   profileId String
--   from      DateTime
--   to        DateTime
--   type      String   @default("AVAILABLE") // AVAILABLE | UNAVAILABLE
--   zones     String   @default("[]") // JSON string[]
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model Media {
--   id          String   @id @default(cuid())
--   profileId   String
--   type        String // PHOTO | VIDEO | SELFTAPE | AUDIO
--   storageKey  String   @unique
--   mime        String?
--   // "profile": shown on the profile and to casting teams the talent applied to.
--   // "library": private to the talent until they choose to submit it.
--   destination String   @default("profile") // profile | library
--   sizeBytes   Int?
--   durationSec Int?
--   order       Int      @default(0)
--   isPrimary   Boolean  @default(false)
--   createdAt   DateTime @default(now())
-- 
--   // Upload state as the owner sees it. A file still in flight is an Upload
--   // row, so a Media row starts READY; PROCESSING and FAILED are for a later
--   // transcoding or metadata step.
--   status         String   @default("READY") // PROCESSING | READY | FAILED
--   title          String?
--   // Profile > Media category (src/domain/media-categories.ts): SELF | PRODUCTIONS
--   // | VIDEOS | OTHER. Null on rows written before categories: read through
--   // mediaCategory(), which falls back on the type.
--   category       String?
--   // A short description the performer writes for the item.
--   description    String?
--   // Version of the upload notice the owner accepted. Consent to store and
--   // show a file. It is never permission to reuse it or to train a model.
--   consentVersion String?
--   updatedAt      DateTime @default(now()) @updatedAt
-- 
--   profile  ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
--   selfTape SelfTape?
--   shares   MediaShare[]
--   drafts   DraftMedia[]
-- 
--   @@schema("public")
-- }
-- 
-- model SelfTape {
--   id               String   @id @default(cuid())
--   mediaId          String   @unique
--   projectId        String?
--   takeNumber       Int      @default(1)
--   qualityScore     Int?
--   qualityBreakdown String   @default("{}") // JSON: framing, light, sound
--   status           String   @default("PROCESSING") // PROCESSING | READY | FAILED
--   lowBandwidth     Boolean  @default(false)
--   createdAt        DateTime @default(now())
-- 
--   // The self-tape this take is a version of (title, optional demo brief).
--   tapeId String?
-- 
--   media   Media    @relation(fields: [mediaId], references: [id], onDelete: Cascade)
--   project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
--   tape    Tape?    @relation(fields: [tapeId], references: [id], onDelete: SetNull)
-- 
--   @@index([tapeId])
--   @@schema("public")
-- }
-- 
-- model CareerEntry {
--   id              String   @id @default(cuid())
--   profileId       String
--   projectRef      String?
--   role            String
--   cachetCents     Int
--   commissionRate  Float
--   commissionCents Int
--   date            DateTime
--   status          String   @default("PENDING") // PENDING | PAID
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- // ─────────────────── Legal & commercial (kept SEPARATE) ───────────────────────
-- 
-- // Free legal representation contract. No price, no plan. Gates opportunities.
-- model Mandat {
--   id              String    @id @default(cuid())
--   profileId       String    @unique
--   status          String    @default("ACTIVE") // ACTIVE | REVOKED
--   documentVersion String    @default("v1")
--   signedAt        DateTime?
--   signatureIp     String?
--   revokedAt       DateTime?
--   createdAt       DateTime  @default(now())
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- // Optional paid tech service. NEVER referenced by Mandat. Polymorphic subject:
-- // ARTIST (userId) for B2C, ORG (organizationId) for B2B.
-- model Subscription {
--   id                   String    @id @default(cuid())
--   subjectType          String // ARTIST | ORG
--   subjectId            String    @unique
--   plan                 String    @default("FREE") // B2C: FREE|PRO|PREMIUM|ULTIMATE — B2B: FREE|PRO|STUDIO|ENTERPRISE
--   priceCents           Int       @default(0)
--   commissionRate       Float     @default(0.10) // B2C only
--   seatCount            Int?
--   stripeSubscriptionId String?
--   status               String    @default("ACTIVE") // ACTIVE | PAST_DUE | CANCELED
--   currentPeriodEnd     DateTime?
--   // A plan granted at no charge until a date (a Limelight purchase includes
--   // Pro). It applies only while `plan` is FREE; see src/lib/billing/entitlement.ts.
--   compPlan             String?
--   compUntil            DateTime?
--   createdAt            DateTime  @default(now())
--   updatedAt            DateTime  @updatedAt
-- 
--   @@schema("public")
-- }
-- 
-- // ─────────────────────────── B2B — Casting domain ────────────────────────────
-- 
-- model Organization {
--   id               String   @id @default(cuid())
--   name             String
--   siret            String?
--   siretStatus      String   @default("PENDING") // PENDING | VERIFIED | REJECTED
--   scope            String   @default("{}") // JSON: project types, zones
--   plan             String   @default("FREE") // FREE | PRO | STUDIO | ENTERPRISE
--   stripeCustomerId String?
--   createdAt        DateTime @default(now())
--   updatedAt        DateTime @updatedAt
-- 
--   memberships Membership[]
--   seats       Seat[]
--   projects    Project[]
--   invitations Invitation[]
-- 
--   @@schema("public")
-- }
-- 
-- model Membership {
--   id             String   @id @default(cuid())
--   userId         String
--   organizationId String
--   role           String   @default("MEMBER") // OWNER | ADMIN | MEMBER
--   seatId         String?  @unique
--   createdAt      DateTime @default(now())
-- 
--   user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
--   organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
--   seat         Seat?        @relation(fields: [seatId], references: [id], onDelete: SetNull)
--   projects     Project[]
-- 
--   @@unique([userId, organizationId])
--   @@schema("public")
-- }
-- 
-- model Seat {
--   id             String   @id @default(cuid())
--   organizationId String
--   status         String   @default("EMPTY") // ACTIVE | INVITED | EMPTY
--   createdAt      DateTime @default(now())
-- 
--   organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
--   membership   Membership?
-- 
--   @@schema("public")
-- }
-- 
-- model Project {
--   id             String    @id @default(cuid())
--   organizationId String
--   createdById    String?
--   title          String
--   status         String    @default("DRAFT") // DRAFT | OPEN | SHORTLISTING | CLOSED
--   roleSpec       String    @default("{}") // JSON: role, ageRange, type, language, accent, constraints
--   shootingFrom   DateTime?
--   shootingTo     DateTime?
--   budgetCents    Int?
--   briefFiles     String    @default("[]") // JSON string[]
--   createdAt      DateTime  @default(now())
--   updatedAt      DateTime  @updatedAt
-- 
--   organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
--   createdBy    Membership?   @relation(fields: [createdById], references: [id], onDelete: SetNull)
--   candidatures Candidature[]
--   selfTapes    SelfTape[]
--   minorCases   MinorCase[]
-- 
--   @@schema("public")
-- }
-- 
-- model Candidature {
--   id                 String   @id @default(cuid())
--   projectId          String
--   artistProfileId    String?
--   externalTalentId   String?
--   source             String   @default("AGENTAL") // AGENTAL | EXTERNAL
--   status             String   @default("NEW") // NEW | SHORTLISTED | STARRED | EXCLUDED | SELFTAPE_REQUESTED | INVITED | CONTRACTED | REJECTED
--   estimatedRateCents Int?
--   appliedAt          DateTime @default(now())
--   timeline           String   @default("[]") // JSON events
-- 
--   project        Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
--   artistProfile  ArtistProfile?  @relation(fields: [artistProfileId], references: [id], onDelete: SetNull)
--   externalTalent ExternalTalent? @relation(fields: [externalTalentId], references: [id], onDelete: SetNull)
--   matchScore     MatchScore?
-- 
--   @@schema("public")
-- }
-- 
-- model MatchScore {
--   id             String   @id @default(cuid())
--   candidatureId  String   @unique
--   score          Int // 0-100
--   reasons        String   @default("[]") // JSON: [{key, values?}] — see src/domain/match-reason.ts
--   factors        String   @default("{}") // JSON: {physical: .8, availability: 1, …}
--   diversityFlags String   @default("[]") // JSON string[]
--   scorerVersion  String   @default("mock-v1")
--   computedAt     DateTime @default(now())
-- 
--   candidature Candidature @relation(fields: [candidatureId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model ExternalTalent {
--   id        String   @id @default(cuid())
--   name      String
--   agency    String?
--   data      String   @default("{}") // JSON: minimal PII / features
--   createdAt DateTime @default(now())
-- 
--   candidatures Candidature[]
-- 
--   @@schema("public")
-- }
-- 
-- // ─────────────────────────── Compliance & comms ──────────────────────────────
-- 
-- model MinorCase {
--   id                    String   @id @default(cuid())
--   artistProfileId       String   @unique
--   projectId             String?
--   prefectoralAuthStatus String   @default("NONE") // NONE | REQUESTED | GRANTED | REFUSED
--   authRef               String?
--   escrowPercent         Int      @default(90)
--   escrowStatus          String   @default("PENDING") // PENDING | HELD | RELEASED
--   parentalPresence      Boolean  @default(false)
--   guardianContact       String   @default("{}") // JSON
--   state                 String   @default("OPENED") // OPENED | DOCS_PENDING | READY | BLOCKED
--   createdAt             DateTime @default(now())
--   updatedAt             DateTime @updatedAt
-- 
--   artistProfile ArtistProfile @relation(fields: [artistProfileId], references: [id], onDelete: Cascade)
--   project       Project?      @relation(fields: [projectId], references: [id], onDelete: SetNull)
-- 
--   @@schema("public")
-- }
-- 
-- model Thread {
--   id            String    @id @default(cuid())
--   subject       String?
--   createdAt     DateTime  @default(now())
--   // TEAM: the one conversation between a performer (userId) and the Agental
--   // team. GENERAL: threads from before that existed.
--   kind          String    @default("GENERAL") // GENERAL | TEAM
--   userId        String?
--   lastMessageAt DateTime?
--   // Set when the assistant hands the conversation to a person; cleared when
--   // the team answers. Shown as "Waiting for the Agental team".
--   waitingForTeamSince DateTime?
--   messages      Message[]
-- 
--   user User? @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@unique([userId, kind])
--   @@index([kind, lastMessageAt])
--   @@index([kind, waitingForTeamSince])
--   @@schema("public")
-- }
-- 
-- model Message {
--   id          String    @id @default(cuid())
--   threadId    String
--   senderId    String?
--   body        String
--   attachments String    @default("[]") // JSON string[]
--   readAt      DateTime?
--   createdAt   DateTime  @default(now())
--   // Which side wrote it. The team member's identity stays in senderId and is
--   // never shown to the performer.
--   fromTeam    Boolean   @default(false)
--   // A random id the browser makes per draft, so a retry stores one message.
--   clientKey   String?
--   // What the performer said the message is about: profile | application | other.
--   topic       String?
--   // Written by the Agental assistant, not by a person. Shown as the assistant.
--   fromAgent   Boolean   @default(false)
-- 
--   thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
--   sender User?  @relation(fields: [senderId], references: [id], onDelete: SetNull)
-- 
--   @@unique([threadId, clientKey])
--   @@index([threadId, createdAt])
--   @@schema("public")
-- }
-- 
-- model AuditLog {
--   id             String   @id @default(cuid())
--   actorUserId    String?
--   organizationId String?
--   action         String
--   resourceType   String
--   resourceId     String
--   before         String   @default("{}") // JSON
--   after          String   @default("{}") // JSON
--   createdAt      DateTime @default(now())
-- 
--   actor User? @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
-- 
--   @@schema("public")
-- }
-- 
-- model Notification {
--   id        String    @id @default(cuid())
--   userId    String
--   kind      String
--   payload   String    @default("{}") // JSON
--   readAt    DateTime?
--   createdAt DateTime  @default(now())
-- 
--   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model Invitation {
--   id             String    @id @default(cuid())
--   organizationId String
--   email          String
--   role           String    @default("MEMBER")
--   token          String    @unique
--   acceptedAt     DateTime?
--   createdAt      DateTime  @default(now())
-- 
--   organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- model UsageCounter {
--   id        String @id @default(cuid())
--   subjectId String // orgId or userId
--   metric    String // activeProjects | filteredCandidatures
--   period    String // YYYY-MM
--   count     Int    @default(0)
-- 
--   @@unique([subjectId, metric, period])
--   @@schema("public")
-- }
-- 
-- model WebhookEvent {
--   id          String    @id @default(cuid())
--   provider    String // stripe | siret
--   externalId  String    @unique
--   payload     String    @default("{}")
--   processedAt DateTime?
--   createdAt   DateTime  @default(now())
-- 
--   @@schema("public")
-- }
-- 
-- // ───────────────────── Direct uploads (photos, videos, self-tapes) ───────────
-- 
-- // A file the browser is sending straight to object storage. The row exists
-- // from createUpload until completeUpload turns it into a Media row, or until
-- // it expires. Media never holds a file that has not arrived.
-- model Upload {
--   id             String   @id @default(cuid())
--   profileId      String
--   type           String // PHOTO | VIDEO | SELFTAPE
--   destination    String   @default("profile") // profile | library
--   storageKey     String   @unique
--   mime           String
--   sizeBytes      Int
--   // Self-tapes: the tape this file becomes a version of, or the title and
--   // demo brief of the tape to create when the upload completes.
--   tapeId         String?
--   title          String?
--   demoBrief      String?
--   consentVersion String?
--   expiresAt      DateTime
--   createdAt      DateTime @default(now())
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
-- 
--   @@index([profileId])
--   @@schema("public")
-- }
-- 
-- // ───────────────────────────── Limelight (websites) ──────────────────────────
-- 
-- model Site {
--   id                  String    @id @default(cuid())
--   userId              String
--   template            String
--   content             String    @default("{}") // JSON, validated by src/domain/site.ts
--   status              String    @default("DRAFT") // DRAFT | PUBLISHED
--   subdomain           String?   @unique
--   customDomain        String?   @unique
--   publishedAt         DateTime?
--   // What the public sees is a revision, never the working draft. The customer
--   // approves a revision; only an approved revision can be published.
--   approvedRevisionId  String?
--   approvedAt          DateTime?
--   approvedById        String?
--   publishedRevisionId String?
--   // The customer's opt-in to show contact details on the public site.
--   showContact         Boolean   @default(false)
--   createdAt           DateTime  @default(now())
--   updatedAt           DateTime  @updatedAt
-- 
--   user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
--   orders    SiteOrder[]
--   domains   SiteDomain[]
--   revisions SiteRevision[]
-- 
--   @@index([userId])
--   @@schema("public")
-- }
-- 
-- // A purchase of a Limelight offer. Kept when the account or the site is
-- // deleted (userId and siteId go null): it is a financial record.
-- model SiteOrder {
--   id                String    @id @default(cuid())
--   userId            String?
--   siteId            String?
--   offer             String // essential | signature
--   amountCents       Int
--   currency          String    @default("USD")
--   studentDiscount   Boolean   @default(false)
--   status            String    @default("PENDING") // PENDING | PAID | CANCELED | REFUNDED
--   provider          String    @default("mock") // mock | stripe
--   providerSessionId String?   @unique
--   providerPaymentId String?
--   paidAt            DateTime?
--   hostingRenewsAt   DateTime?
--   createdAt         DateTime  @default(now())
-- 
--   user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
--   site Site? @relation(fields: [siteId], references: [id], onDelete: SetNull)
-- 
--   @@index([userId])
--   @@index([siteId])
--   @@schema("public")
-- }
-- 
-- // A request for the student price on a Limelight offer. Proof arrives by
-- // email; an admin approves here. One per user, used by one paid order.
-- model StudentPriceRequest {
--   id        String    @id @default(cuid())
--   userId    String    @unique
--   status    String    @default("PENDING") // PENDING | APPROVED | REJECTED | USED
--   decidedBy String?
--   decidedAt DateTime?
--   usedAt    DateTime?
--   createdAt DateTime  @default(now())
-- 
--   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@schema("public")
-- }
-- 
-- // ───────────────────────────── College student codes ─────────────────────────
-- 
-- // Six-digit codes. Only an HMAC of the code is stored (src/lib/student-code.ts).
-- model StudentCode {
--   id        String    @id @default(cuid())
--   codeHash  String    @unique
--   label     String?
--   expiresAt DateTime?
--   maxUses   Int?
--   uses      Int       @default(0)
--   createdAt DateTime  @default(now())
-- 
--   redemptions StudentCodeRedemption[]
-- 
--   @@schema("public")
-- }
-- 
-- model StudentCodeRedemption {
--   id        String   @id @default(cuid())
--   codeId    String
--   userId    String
--   createdAt DateTime @default(now())
-- 
--   code StudentCode @relation(fields: [codeId], references: [id], onDelete: Cascade)
--   user User        @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@unique([codeId, userId])
--   @@index([userId])
--   @@schema("public")
-- }
-- 
-- // ───────────────────────────────── Rate limiting ─────────────────────────────
-- 
-- // One row per counted attempt. `key` names what is limited, for example
-- // "student-code:<userId>". Serverless instances share no memory, so the
-- // counter lives here. Old rows are pruned as new ones arrive.
-- model RateLimitEvent {
--   id        String   @id @default(cuid())
--   key       String
--   createdAt DateTime @default(now())
-- 
--   @@index([key, createdAt])
--   @@schema("public")
-- }
-- 
-- // ─────────────────────── Self-tapes: versions and sharing ────────────────────
-- 
-- // A self-tape as the talent thinks of it: a title, an optional demo brief,
-- // and its saved versions (SelfTape rows, each with its Media file).
-- model Tape {
--   id        String   @id @default(cuid())
--   profileId String
--   title     String
--   demoBrief String?
--   createdAt DateTime @default(now())
--   updatedAt DateTime @updatedAt
-- 
--   profile ArtistProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
--   takes   SelfTape[]
-- 
--   @@index([profileId])
--   @@schema("public")
-- }
-- 
-- // A deliberate, time-limited link to one clip. Only a hash of the token is
-- // stored. Revoking, expiry, or deleting the clip ends it.
-- model MediaShare {
--   id           String    @id @default(cuid())
--   mediaId      String
--   tokenHash    String    @unique
--   createdById  String
--   expiresAt    DateTime
--   revokedAt    DateTime?
--   viewCount    Int       @default(0)
--   lastViewedAt DateTime?
--   createdAt    DateTime  @default(now())
-- 
--   media Media @relation(fields: [mediaId], references: [id], onDelete: Cascade)
-- 
--   @@index([mediaId])
--   @@schema("public")
-- }
-- 
-- // ─────────────── Actor-side workflow: briefs, fit, drafts (dry run) ──────────
-- // Kept apart from the casting-side Project / Candidature / MatchScore tables:
-- // suggestions made to a performer and shortlists shown to a producer never
-- // share a row.
-- 
-- model Brief {
--   id           String    @id @default(cuid())
--   source       String // manual | fixture | name of an approved integration
--   sourceRef    String?
--   dedupeKey    String    @unique
--   title        String
--   production   String?
--   roleName     String?
--   roleType     String? // a SpecialtyKind when the source says so
--   description  String    @default("")
--   location     String?
--   country      String? // ISO 3166-1 alpha-2 when known
--   remote       Boolean?
--   startsOn     DateTime?
--   endsOn       DateTime?
--   paid         Boolean?
--   rateCents    Int?
--   unionStatus  String?
--   requirements String    @default("{}") // JSON, validated by src/domain/workflow/brief.ts
--   // What the role asks applicants to send: {"questions":[...],"videos":[...]}
--   // (src/domain/application-response.ts). "{}" when it asks for nothing.
--   submission   String    @default("{}")
--   expiresAt    DateTime?
--   status       String    @default("ACTIVE") // ACTIVE | EXPIRED | WITHDRAWN
--   raw          String    @default("{}") // as received, for audit
--   receivedAt   DateTime  @default(now())
--   updatedAt    DateTime  @updatedAt
-- 
--   evaluations FitEvaluation[]
--   drafts      ApplicationDraft[]
-- 
--   @@index([status, expiresAt])
--   @@schema("public")
-- }
-- 
-- // One assessment of one brief for one performer. inputHash covers the brief,
-- // the profile fields read, the preferences and the rule and model versions,
-- // so the same inputs are never assessed twice.
-- model FitEvaluation {
--   id              String   @id @default(cuid())
--   briefId         String
--   profileId       String
--   decision        String // eligible | needs_review | ineligible
--   rulesPassed     String   @default("[]")
--   ruleFailures    String   @default("[]")
--   unknowns        String   @default("[]")
--   reasons         String   @default("[]")
--   profileEvidence String   @default("[]")
--   briefEvidence   String   @default("[]")
--   ruleVersion     String
--   modelVersion    String?
--   inputHash       String
--   createdAt       DateTime @default(now())
-- 
--   brief   Brief              @relation(fields: [briefId], references: [id], onDelete: Cascade)
--   profile ArtistProfile      @relation(fields: [profileId], references: [id], onDelete: Cascade)
--   drafts  ApplicationDraft[]
-- 
--   @@unique([briefId, profileId, inputHash])
--   @@index([profileId])
--   @@schema("public")
-- }
-- 
-- // An application the performer may review. Nothing is ever submitted from
-- // here: approving records a decision and that is all.
-- model ApplicationDraft {
--   id             String    @id @default(cuid())
--   profileId      String
--   briefId        String
--   evaluationId   String?
--   status         String    @default("DRAFT") // DRAFT | APPROVED | DECLINED | NEEDS_INFO | ACCEPTED | SUBMITTED
--   // The performer's answers to the role's questions, in order (JSON string[]).
--   answers        String    @default("[]")
--   // "Accept" on the role, and "Submit" (ready for the Agental team's review).
--   // Nothing is sent to a casting site.
--   acceptedAt     DateTime?
--   submittedAt    DateTime?
--   note           String?
--   idempotencyKey String    @unique
--   reviewDecision String?
--   reviewReason   String?
--   reviewedAt     DateTime?
--   createdAt      DateTime  @default(now())
--   updatedAt      DateTime  @updatedAt
-- 
--   profile    ArtistProfile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
--   brief      Brief          @relation(fields: [briefId], references: [id], onDelete: Cascade)
--   evaluation FitEvaluation? @relation(fields: [evaluationId], references: [id], onDelete: SetNull)
--   media      DraftMedia[]
-- 
--   @@unique([profileId, briefId])
--   @@schema("public")
-- }
-- 
-- model DraftMedia {
--   draftId   String
--   mediaId   String
--   // Which requested video this clip answers (0-based), or null for a free attachment.
--   slot      Int?
--   createdAt DateTime @default(now())
-- 
--   draft ApplicationDraft @relation(fields: [draftId], references: [id], onDelete: Cascade)
--   media Media            @relation(fields: [mediaId], references: [id], onDelete: Cascade)
-- 
--   @@id([draftId, mediaId])
--   @@index([mediaId])
--   @@schema("public")
-- }
-- 
-- // A recoverable unit of workflow work, with its limits and its cost.
-- model WorkflowRun {
--   id             String    @id @default(cuid())
--   kind           String
--   idempotencyKey String    @unique
--   status         String    @default("PENDING") // PENDING | RUNNING | SUCCEEDED | FAILED | DEAD
--   attempts       Int       @default(0)
--   maxAttempts    Int       @default(3)
--   modelCalls     Int       @default(0)
--   costMicroUsd   Int       @default(0)
--   subjectRef     String? // record ids only, never personal data
--   lastError      String? // redacted
--   result         String    @default("{}")
--   startedAt      DateTime?
--   finishedAt     DateTime?
--   createdAt      DateTime  @default(now())
--   updatedAt      DateTime  @updatedAt
-- 
--   @@index([kind, status])
--   @@index([createdAt])
--   @@schema("public")
-- }
-- 
-- // ──────────────────── Limelight: lead intake and site hosting ────────────────
-- 
-- // A "Request a portfolio site" submission. One row per email address; a
-- // repeat updates lastSeenAt and the counter.
-- model LimelightLead {
--   id             String   @id @default(cuid())
--   reference      String   @unique
--   email          String   @unique
--   name           String
--   performerType  String?
--   portfolioUrl   String?
--   // What they need, in their words. The phone is kept only when the person
--   // asked for a call back.
--   need           String?
--   contactPref    String   @default("email") // email | call
--   phone          String?
--   source         String
--   consentVersion String
--   marketingOptIn Boolean  @default(false)
--   locale         String   @default("en")
--   status         String   @default("NEW") // NEW | CONTACTED | CLOSED
--   submissions    Int      @default(1)
--   firstSeenAt    DateTime @default(now())
--   lastSeenAt     DateTime @default(now())
-- 
--   @@index([status, firstSeenAt])
--   @@schema("limelight")
-- }
-- 
-- // Transactional outbox: a message to deliver, written in the same
-- // transaction as the record it announces, then sent with retries.
-- model OutboxMessage {
--   id            String    @id @default(cuid())
--   kind          String
--   dedupeKey     String    @unique
--   payload       String    @default("{}") // record references only
--   status        String    @default("PENDING") // PENDING | SENT | DEAD
--   attempts      Int       @default(0)
--   maxAttempts   Int       @default(5)
--   nextAttemptAt DateTime  @default(now())
--   lastError     String?
--   createdAt     DateTime  @default(now())
--   sentAt        DateTime?
-- 
--   @@index([status, nextAttemptAt])
--   @@schema("limelight")
-- }
-- 
-- // A hostname that serves a site: the hosted subdomain, or a domain the
-- // customer owns and has proven with a DNS record.
-- model SiteDomain {
--   id                String    @id @default(cuid())
--   siteId            String
--   hostname          String    @unique
--   kind              String // SUBDOMAIN | CUSTOM
--   status            String    @default("PENDING") // PENDING | VERIFIED | ACTIVE | FAILED
--   verificationToken String
--   verifiedAt        DateTime?
--   lastCheckedAt     DateTime?
--   createdAt         DateTime  @default(now())
-- 
--   site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)
-- 
--   @@index([siteId])
--   @@schema("limelight")
-- }
-- 
-- // An immutable snapshot of a site's template and content.
-- model SiteRevision {
--   id          String   @id @default(cuid())
--   siteId      String
--   version     Int
--   template    String
--   content     String
--   note        String?
--   createdById String?
--   createdAt   DateTime @default(now())
-- 
--   site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)
-- 
--   @@unique([siteId, version])
--   @@schema("limelight")
-- }
-- 
-- // ───────────────────── AI role searches ("Start finding roles") ─────────────────────
-- 
-- // One row per click on "Start finding roles". The quota is checked and the row
-- // written in one transaction (see src/lib/role-search.ts). n8n picks up rows
-- // with status "queued"; the contract is in docs/HANDOFF.md.
-- model RoleSearchRequest {
--   id          String    @id @default(cuid())
--   userId      String
--   /// Plan at the time of the click: FREE (shown as Basic), PRO, PREMIUM, ULTIMATE.
--   plan        String
--   /// "lifetime" for a one-time allowance, "YYYY-MM" (UTC) for a monthly one.
--   periodKey   String
--   /// 1..limit within (userId, periodKey). The unique index is the last guard
--   /// against going over the limit.
--   seq         Int
--   /// Random id from the browser, so a retried click stores one row.
--   clientKey   String?
--   /// queued | running | done | failed | canceled
--   status      String    @default("queued")
--   startedAt   DateTime?
--   completedAt DateTime?
--   /// Short reason when failed, written by the workflow. No personal data.
--   error       String?
--   /// The n8n execution that claimed the row (round 7). A completion from any
--   /// other execution is refused, so a retried or stray run cannot write twice.
--   claimedBy   String?
--   createdAt   DateTime  @default(now())
--   updatedAt   DateTime  @updatedAt
-- 
--   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@unique([userId, periodKey, seq])
--   @@unique([userId, clientKey])
--   @@index([status, createdAt])
--   @@map("role_search_requests")
--   @@schema("public")
-- }
-- 
-- // A pending "College student? Verify your school email." request. The link
-- // holds a token whose SHA-256 is stored here; confirming copies the address
-- // to User.studentEmail (unique) and stamps User.studentVerifiedAt.
-- model StudentEmailClaim {
--   id          String    @id @default(cuid())
--   userId      String
--   email       String
--   tokenHash   String    @unique
--   expiresAt   DateTime
--   confirmedAt DateTime?
--   createdAt   DateTime  @default(now())
-- 
--   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
-- 
--   @@index([userId, createdAt])
--   @@index([email])
--   @@schema("public")
-- }
-- 
-- /// Replies to people who email the team directly, handled by the n8n "Beta V2
-- /// Direct Replies" workflow (round 7). One row per inbound Gmail message: the
-- /// claim that keeps a reply single, then the outcome. Gmail ids and reasons
-- /// only; the email text stays in Gmail.
-- model InboxReply {
--   id             String    @id @default(cuid())
--   gmailThreadId  String
--   gmailMessageId String
--   /// Returned to the workflow on claim; the completion must carry it.
--   claimId        String    @unique @default(cuid())
--   executionId    String?
--   /// claimed | sent | send_needs_reconciliation | needs_human_review | send_skipped
--   status         String    @default("claimed")
--   sentMessageId  String?
--   reason         String?
--   queue          String?
--   priority       String?
--   reviewedAt     DateTime?
--   createdAt      DateTime  @default(now())
--   updatedAt      DateTime  @updatedAt
-- 
--   @@unique([gmailThreadId, gmailMessageId])
--   @@index([status, createdAt])
--   @@schema("public")
-- }
-- 
-- // Every email the app sends (admin site > Emails). Created queued, then sent,
-- // logged (no sender configured) or failed; Resend's webhook moves it to
-- // delivered, bounced, complained or delayed. Recipient and subject only, never
-- // the body or a link.
-- model EmailLog {
--   id          String    @id @default(cuid())
--   to          String
--   subject     String
--   kind        String    @default("other") // verify | reset | student | deletion_warning | limelight_alert | other
--   resendId    String?   @unique
--   status      String    @default("queued") // queued | sent | logged | failed | delivered | bounced | complained | delayed
--   error       String?
--   createdAt   DateTime  @default(now())
--   updatedAt   DateTime  @default(now()) @updatedAt
--   lastEventAt DateTime?
-- 
--   @@index([createdAt])
--   @@schema("public")
-- }
