-- Round 8b, group 1: the AI agent setup in Messages is saved on the account
-- (the agent itself is not live). Additive: four nullable columns.
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "agentNameChoice" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "agentCustomName" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "agentHelps" TEXT;
ALTER TABLE "ArtistProfile" ADD COLUMN IF NOT EXISTS "agentSavedAt" TIMESTAMP(3);
