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
