-- Round 9, group 7: replies to the emails we receive go out only after a
-- staff member approves them. The workflow posts its draft with the original
-- email; Admin > Replies to approve shows both. Additive columns. The email
-- texts are kept 90 days, then cleared (src/lib/reply-drafts.ts).
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "fromAddress" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "originalText" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "replyText" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "inReplyTo" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "references" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "draftedAt" TIMESTAMP(3);
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "decidedById" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "decision" TEXT;
ALTER TABLE "InboxReply" ADD COLUMN IF NOT EXISTS "resendId" TEXT;
