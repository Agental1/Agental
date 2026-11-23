-- Round 8d: a performer can have several conversations with the Agental team,
-- and can delete one from their own view. Additive: nothing is removed.
-- The one-thread-per-person unique index becomes a plain index (older code
-- still finds one of the person's threads after a rollback).

ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "hiddenForUserAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Thread_userId_kind_key";
CREATE INDEX IF NOT EXISTS "Thread_userId_kind_lastMessageAt_idx" ON "Thread"("userId", "kind", "lastMessageAt");
