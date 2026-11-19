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
