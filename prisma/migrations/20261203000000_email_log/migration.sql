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
