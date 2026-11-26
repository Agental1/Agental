-- Round 12, group 6: onboarding as a conversation. Additive only.
-- OnboardingDraft holds answers not yet confirmed and the one-go transcript,
-- server side, and goes with the profile (cascade).
CREATE TABLE IF NOT EXISTS "OnboardingDraft" (
  "id" TEXT PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "transcript" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingDraft_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingDraft_profileId_key" ON "OnboardingDraft" ("profileId");
ALTER TABLE "OnboardingDraft" ENABLE ROW LEVEL SECURITY;

-- The switch, only when absent: Test accounts plus an allowlist holding one
-- entry, stored as the sha256 of the lowercased address (never in clear).
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('onboarding.chat', '{"mode":"test_and_allowlist","allowlist":["sha256:89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c"],"since":"2027-01-01T00:00:00.000Z"}', now())
ON CONFLICT ("key") DO NOTHING;
