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
