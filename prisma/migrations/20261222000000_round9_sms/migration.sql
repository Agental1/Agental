-- Round 9, group 8: the "roles found" text, behind SMS_ENABLED (off). Additive:
-- the opt-out date (STOP), the last text sent, and a log of texts (ids and
-- statuses only, never the message or the number). RLS on, no policy.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "smsOptOutAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rolesTextAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "SmsLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "providerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SmsLog_createdAt_idx" ON "SmsLog" ("createdAt");
ALTER TABLE "SmsLog" ENABLE ROW LEVEL SECURITY;
