-- Beta server work: self-tape versions and share links, the actor-side
-- workflow (briefs, fit evaluations, application drafts, runs), and the
-- Limelight module (lead intake, outbox, site domains and revisions).
--
-- Limelight gets its own Postgres schema. Supabase's Data API exposes
-- "public" only, so nothing in "limelight" is reachable through it, and a
-- dedicated database role can be scoped to that schema later. The three
-- Limelight tables created in the previous migration are MOVED there, with
-- their rows, indexes, constraints and Row Level Security: SET SCHEMA keeps
-- all of it. (Prisma's own diff would drop and recreate them.)
--
-- Everything else is additive.

CREATE SCHEMA IF NOT EXISTS "limelight";

ALTER TABLE "public"."Site" SET SCHEMA "limelight";
ALTER TABLE "public"."SiteOrder" SET SCHEMA "limelight";
ALTER TABLE "public"."StudentPriceRequest" SET SCHEMA "limelight";

-- Sites publish a revision the customer approved, never the working draft.
ALTER TABLE "limelight"."Site" ADD COLUMN "approvedRevisionId" TEXT,
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
ALTER TABLE "limelight"."SiteDomain" ADD CONSTRAINT "SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "limelight"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limelight"."SiteRevision" ADD CONSTRAINT "SiteRevision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "limelight"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
