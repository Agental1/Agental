-- Round 9, group 4: tokens and cost of each AI job, per provider (searches
-- through n8n, the assistant in Messages). Additive: one new table, RLS on, no
-- policy (only the app's server role reads it). Record ids only: `ref` is the
-- search request or message id, never personal data.
CREATE TABLE IF NOT EXISTS "AiUsage" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "model" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiUsage_createdAt_idx" ON "AiUsage" ("createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_kind_ref_idx" ON "AiUsage" ("kind", "ref");
CREATE UNIQUE INDEX IF NOT EXISTS "AiUsage_kind_ref_provider_key" ON "AiUsage" ("kind", "ref", "provider");
ALTER TABLE "AiUsage" ENABLE ROW LEVEL SECURITY;
